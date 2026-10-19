param(
    # Bỏ qua Docker (Postgres/SearXNG đã chạy sẵn và infra/local/.env đã có)
    [switch]$SkipInfra
)

# Chuẩn bị chạy local từ repo vừa clone, chạy một lần (chạy lại an toàn):
#  1. Hạ tầng Docker (infra/local/bootstrap.ps1): Postgres+pgvector 127.0.0.1:15432, SearXNG 127.0.0.1:18081
#  2. apps/api/.env.local: DATABASE_URL lấy mật khẩu từ infra/local/.env, AUTH_SECRET ngẫu nhiên nếu còn placeholder
#  3. npm ci (api) + db:migrate + db:seed (in mật khẩu tài khoản demo ở lần đầu)
# Sau đó: .\infra\staging\start.ps1

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$infraEnv = Join-Path $repoRoot 'infra/local/.env'
$apiRoot = Join-Path $repoRoot 'apps/api'
$apiEnv = Join-Path $apiRoot '.env.local'
$utf8 = New-Object System.Text.UTF8Encoding($false)

# PowerShell 5.1 biến stderr của lệnh native thành lỗi khi bị chuyển hướng; chỉ cần exit code
function Test-NativeCommand([scriptblock]$command) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $command *> $null
        return $LASTEXITCODE -eq 0
    } finally {
        $ErrorActionPreference = $previous
    }
}

# Chạy lệnh native, chỉ coi exit code khác 0 là lỗi (cảnh báo trên stderr không làm dừng script)
function Invoke-Native([string]$description, [scriptblock]$command) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $command
        if ($LASTEXITCODE -ne 0) { throw ($description + ' failed (exit ' + $LASTEXITCODE + ')') }
    } finally {
        $ErrorActionPreference = $previous
    }
}

if (-not $SkipInfra) {
    foreach ($image in @('pgvector/pgvector:0.8.7-pg17-bookworm', 'searxng/searxng:latest')) {
        if (-not (Test-NativeCommand { docker image inspect $image --format '{{.Id}}' })) {
            Invoke-Native ('docker pull ' + $image) { docker pull $image }
        }
    }
    & (Join-Path $repoRoot 'infra/local/bootstrap.ps1')
}
if (-not (Test-Path -LiteralPath $infraEnv)) { throw 'infra/local/.env not found. Run without -SkipInfra first.' }

$deadline = (Get-Date).AddSeconds(90)
do {
    $ready = Test-NativeCommand { docker exec ai-growth-os-local-postgres-1 pg_isready -U ai_growth_dev -d ai_growth_os }
    if (-not $ready) { Start-Sleep -Seconds 2 }
} while (-not $ready -and (Get-Date) -lt $deadline)
if (-not $ready) { throw 'Postgres container is not ready (docker compose -f infra/local/compose.yaml ps).' }

# 2. .env.local của API: giữ các dòng khác, chỉ ghi DATABASE_URL và AUTH_SECRET khi cần
$password = ((Get-Content -LiteralPath $infraEnv | Where-Object { $_ -match '^POSTGRES_PASSWORD=' }) -replace '^POSTGRES_PASSWORD=', '').Trim()
if (-not $password) { throw 'POSTGRES_PASSWORD missing in infra/local/.env' }
$databaseUrl = 'postgres://ai_growth_dev:' + [Uri]::EscapeDataString($password) + '@127.0.0.1:15432/ai_growth_os'

if (-not (Test-Path -LiteralPath $apiEnv)) { Copy-Item -LiteralPath (Join-Path $apiRoot '.env.example') -Destination $apiEnv }
$lines = [System.Collections.Generic.List[string]]::new()
$lines.AddRange([string[]](Get-Content -LiteralPath $apiEnv))

function Set-EnvLine([string]$name, [string]$value, [scriptblock]$shouldReplace) {
    $index = -1
    for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -match ('^' + $name + '=')) { $index = $i; break } }
    if ($index -lt 0) { $lines.Add($name + '=' + $value); return $true }
    $current = $lines[$index].Substring($name.Length + 1)
    if (& $shouldReplace $current) { $lines[$index] = $name + '=' + $value; return $true }
    return $false
}

[void](Set-EnvLine 'DATABASE_URL' $databaseUrl { param($current) $current -ne $databaseUrl })
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
if (Set-EnvLine 'AUTH_SECRET' $secret { param($current) $current.Length -lt 32 -or $current -like 'change_me*' }) {
    Write-Output 'Generated a new AUTH_SECRET in apps/api/.env.local.'
}
[IO.File]::WriteAllText($apiEnv, (($lines -join "`n") + "`n"), $utf8)

# 3. Dependencies + schema + dữ liệu demo
if (-not (Test-Path -LiteralPath (Join-Path $apiRoot 'node_modules/next/dist/bin/next'))) {
    Invoke-Native 'npm ci (apps/api)' { npm.cmd --prefix $apiRoot ci --no-fund --no-audit }
}
Invoke-Native 'db:migrate' { npm.cmd --prefix $apiRoot run db:migrate }
Invoke-Native 'db:seed' { npm.cmd --prefix $apiRoot run db:seed }

Write-Output ''
Write-Output 'Local setup done. Next: .\infra\staging\start.ps1  then open http://localhost:3000/login'
