$ErrorActionPreference = 'Stop'
$envPath = Join-Path $PSScriptRoot '.env'

if (-not (Test-Path -LiteralPath $envPath)) {
    $postgresImage = (& docker image inspect pgvector/pgvector:0.8.7-pg17-bookworm --format '{{index .RepoDigests 0}}')
    if ($LASTEXITCODE -ne 0) { throw 'Pull pgvector/pgvector:0.8.7-pg17-bookworm first.' }
    $searchImage = (& docker image inspect searxng/searxng:latest --format '{{index .RepoDigests 0}}')
    if ($LASTEXITCODE -ne 0) { throw 'Pull searxng/searxng:latest first.' }
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $postgresBytes = New-Object byte[] 32
        $searchBytes = New-Object byte[] 32
        $rng.GetBytes($postgresBytes)
        $rng.GetBytes($searchBytes)
        $postgresPassword = ([BitConverter]::ToString($postgresBytes)).Replace('-', '').ToLowerInvariant()
        $searchSecret = ([BitConverter]::ToString($searchBytes)).Replace('-', '').ToLowerInvariant()
        $lines = @(
            "POSTGRES_IMAGE=$postgresImage"
            "SEARXNG_IMAGE=$searchImage"
            "POSTGRES_PASSWORD=$postgresPassword"
            "SEARXNG_SECRET=$searchSecret"
        )
        [IO.File]::WriteAllText($envPath, ($lines -join "`n") + "`n", (New-Object Text.UTF8Encoding($false)))
    } finally {
        $rng.Dispose()
    }
}

# Do not render compose config: it contains expanded credentials.
& docker compose --project-directory $PSScriptRoot -f (Join-Path $PSScriptRoot 'compose.yaml') config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Compose validation failed.' }
& docker compose --project-directory $PSScriptRoot -f (Join-Path $PSScriptRoot 'compose.yaml') up -d
if ($LASTEXITCODE -ne 0) { throw 'Local service startup failed.' }
Write-Output 'Started AI Growth OS local dependencies. Secrets are in ignored infra/local/.env.'
