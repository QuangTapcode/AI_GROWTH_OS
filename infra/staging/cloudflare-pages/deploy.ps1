param(
    # Origin HTTPS của API. Bỏ trống: dùng/khởi động quick tunnel tới API local (infra/staging/tunnel.ps1).
    [string]$ApiOrigin,
    [string]$ProjectName = 'aigrowthos-staging',
    [string]$Branch = 'main',
    # Chỉ build vào .runtime/pages-build, không deploy (kiểm tra bằng wrangler pages dev)
    [switch]$SkipDeploy
)

# Deploy apps/web lên Cloudflare Pages dưới dạng static export + Pages Function proxy /v1/* tới API.
# Web gọi API cùng origin (NEXT_PUBLIC_API_BASE_URL=/v1) nên không cần CORS cho pages.dev.
# Không build trong apps/web để không ghi đè .next của staging đang chạy.

$ErrorActionPreference = 'Stop'
$stagingRoot = Split-Path $PSScriptRoot -Parent
$repoRoot = Split-Path (Split-Path $stagingRoot -Parent) -Parent
$webRoot = Join-Path $repoRoot 'apps/web'
$work = Join-Path $stagingRoot '.runtime/pages-build'
$ga4Id = 'G-8LQN27Y8QQ'

if (-not $ApiOrigin) {
    $ApiOrigin = (& (Join-Path $stagingRoot 'tunnel.ps1') | Select-Object -Last 1)
}
if ($ApiOrigin -notmatch '^https://[^/]+$') { throw ('ApiOrigin must look like https://host (got ' + $ApiOrigin + ')') }
# Hostname quick tunnel mới cần vài giây để DNS phân giải được
$deadline = (Get-Date).AddSeconds(90)
$health = $null
do {
    try { $health = Invoke-RestMethod -Uri ($ApiOrigin + '/v1/health') -TimeoutSec 15 } catch { Start-Sleep -Seconds 3 }
} while (-not $health -and (Get-Date) -lt $deadline)
if (-not $health -or $health.status -ne 'ok') { throw ('API at ' + $ApiOrigin + ' is not reachable/healthy') }
Write-Output ('API origin: ' + $ApiOrigin)

# 1. Bản sao web (giữ node_modules giữa các lần build nếu lockfile không đổi)
New-Item -ItemType Directory -Path $work -Force | Out-Null
Get-ChildItem -LiteralPath $work -Force | Where-Object { $_.Name -ne 'node_modules' } | Remove-Item -Recurse -Force
foreach ($item in @('src', 'public', 'package.json', 'package-lock.json', 'tsconfig.json', 'postcss.config.mjs', 'next-env.d.ts')) {
    $source = Join-Path $webRoot $item
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $work -Recurse -Force }
}
# Route handler động (/health) không dùng được với output: export
Remove-Item -LiteralPath (Join-Path $work 'src/app/health') -Recurse -Force

@'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: { root: process.cwd() },
  experimental: { cpus: 1 },
};

export default nextConfig;
'@ | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $work 'next.config.ts')

$lockHash = (Get-FileHash -LiteralPath (Join-Path $work 'package-lock.json')).Hash
$lockStamp = Join-Path $work 'node_modules/.lock-hash'
if (-not (Test-Path -LiteralPath $lockStamp) -or (Get-Content -Raw -LiteralPath $lockStamp).Trim() -ne $lockHash) {
    & npm.cmd --prefix $work ci --no-fund --no-audit
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    Set-Content -LiteralPath $lockStamp -Value $lockHash
}

# 2. Build static export, API cùng origin qua Pages Function
$env:NEXT_PUBLIC_API_BASE_URL = '/v1'
$env:NEXT_TELEMETRY_DISABLED = '1'
Push-Location $work
try {
    & npx.cmd next build
    if ($LASTEXITCODE -ne 0) { throw 'next build failed' }
} finally {
    Pop-Location
    Remove-Item Env:NEXT_PUBLIC_API_BASE_URL
}
$out = Join-Path $work 'out'

# 3. Giữ GA4 (xác minh GSC cho URL-prefix pages.dev) và header noindex như trang staging cũ
$tag = '<script async src="https://www.googletagmanager.com/gtag/js?id=' + $ga4Id + '"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","' + $ga4Id + '");</script>'
$utf8 = New-Object System.Text.UTF8Encoding($false)
Get-ChildItem -LiteralPath $out -Recurse -Filter '*.html' | ForEach-Object {
    $html = [System.IO.File]::ReadAllText($_.FullName)
    if (-not $html.Contains('<head>')) { throw ('No <head> in ' + $_.FullName) }
    [System.IO.File]::WriteAllText($_.FullName, $html.Replace('<head>', '<head>' + $tag), $utf8)
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '_headers') -Destination $out

# 4. Pages Function proxy /v1/* → API origin
$functionDir = Join-Path $work 'functions/v1'
New-Item -ItemType Directory -Path $functionDir -Force | Out-Null
$proxy = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'v1-proxy.template.js')).Replace('__API_ORIGIN__', $ApiOrigin)
[System.IO.File]::WriteAllText((Join-Path $functionDir '[[path]].js'), $proxy, $utf8)

if ($SkipDeploy) {
    Write-Output ('Built ' + $out + ' (not deployed). Preview: cd ' + $work + '; npx wrangler pages dev out')
    exit 0
}

Push-Location $work
try {
    & npx.cmd --yes wrangler@4.20.0 pages deploy out --project-name $ProjectName --branch $Branch --commit-dirty=true
    if ($LASTEXITCODE -ne 0) { throw 'wrangler pages deploy failed' }
} finally {
    Pop-Location
}
