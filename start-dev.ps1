#Requires -Version 5.1
<#
.SYNOPSIS
    Start the FHP local development environment.

.DESCRIPTION
    1. Starts the PostgreSQL Docker container (fhp-postgres)
    2. Runs all pending DB migrations
    3. Seeds governance users (npm run seed:governance)
    4. Launches the static HTML file server on port 9999 (background)
    5. Launches the Fastify API server on port 3000 (foreground)

    Press Ctrl+C to stop the API server. The static server process
    is also terminated on exit via the registered cleanup handler.

.EXAMPLE
    .\start-dev.ps1

.NOTES
    Requires: Docker Desktop, Node.js 20+, npm
    First run: ensure api/.env is configured (copy from api/.env.example if needed)
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = $PSScriptRoot
$ApiDir   = Join-Path $RepoRoot 'api'
$RolesDir = Join-Path $RepoRoot 'db\roles'
$MigrDir  = Join-Path $RepoRoot 'db\migrations'
$EnvFile  = Join-Path $ApiDir '.env'

# Load .env
if (-not (Test-Path $EnvFile)) {
    Write-Error "Missing $EnvFile - copy api/.env.example and fill in values."
    exit 1
}

foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $kv = $line -split '=', 2
    $k  = $kv[0].Trim()
    $v  = $kv[1].Trim()
    if (-not [System.Environment]::GetEnvironmentVariable($k)) {
        [System.Environment]::SetEnvironmentVariable($k, $v, 'Process')
    }
}

$DatabaseUrl = $env:DATABASE_URL
if (-not $DatabaseUrl) {
    Write-Error "DATABASE_URL not set in $EnvFile"
    exit 1
}

# Parse DATABASE_URL  (postgres://user:pass@host:port/dbname)
if ($DatabaseUrl -match '^postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/(.+)$') {
    $PgUser = $Matches[1]
    $PgPass = $Matches[2]
    $PgPort = if ($Matches[4]) { $Matches[4] } else { '5432' }
    $PgDb   = $Matches[5] -replace '\?.*$', ''
} else {
    Write-Error "Could not parse DATABASE_URL: $DatabaseUrl"
    exit 1
}

# Start / ensure PostgreSQL container
Write-Host ''
Write-Host '==> PostgreSQL' -ForegroundColor Cyan

$existing = docker ps -a --filter 'name=^/fhp-postgres$' --format '{{.Names}}' 2>$null
if ($existing -eq 'fhp-postgres') {
    Write-Host '    Removing existing fhp-postgres container...'
    docker rm -f fhp-postgres | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error 'Failed to remove existing fhp-postgres container.'
        exit 1
    }
}

Write-Host '    Starting fhp-postgres container...'
docker run --name fhp-postgres -e "POSTGRES_PASSWORD=$PgPass" -e "POSTGRES_DB=$PgDb" -e "POSTGRES_USER=$PgUser" -p "${PgPort}:5432" -d postgres:latest | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Failed to start fhp-postgres container.'
    exit 1
}

Write-Host '    Waiting for Postgres to accept connections...'
$attempts = 0
do {
    Start-Sleep -Seconds 2
    $attempts++
    $ready = docker exec fhp-postgres pg_isready -U $PgUser 2>$null
} while ($ready -notlike '*accepting connections*' -and $attempts -lt 15)

if ($attempts -ge 15) {
    Write-Host '    Container logs:' -ForegroundColor Yellow
    docker logs fhp-postgres
    Write-Error 'PostgreSQL did not become ready in time.'
    exit 1
}
Write-Host '    Ready.' -ForegroundColor Green

# Run roles bootstrap (required before migrations that grant to app roles)
Write-Host ''
Write-Host '==> Roles' -ForegroundColor Cyan

$RoleSql = Join-Path $RolesDir '000_roles.sql'
if (-not (Test-Path $RoleSql)) {
    Write-Error "Missing roles bootstrap file: $RoleSql"
    exit 1
}

Write-Host '    000_roles.sql...'
Get-Content $RoleSql | docker exec -i fhp-postgres psql -v ON_ERROR_STOP=1 -U $PgUser -d $PgDb 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Error '    Roles bootstrap failed.'
    exit 1
}
Write-Host '    Done.' -ForegroundColor Green

# Run migrations
Write-Host ''
Write-Host '==> Migrations' -ForegroundColor Cyan

Get-ChildItem -Path $MigrDir -Filter '*.sql' | Sort-Object Name | ForEach-Object {
    Write-Host "    $($_.Name)..."
    Get-Content $_.FullName | docker exec -i fhp-postgres psql -v ON_ERROR_STOP=1 -U $PgUser -d $PgDb 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "    Migration $($_.Name) failed."
        exit 1
    }
}
Write-Host '    Done.' -ForegroundColor Green

# Seed governance users
Write-Host ''
Write-Host '==> Governance users' -ForegroundColor Cyan

Push-Location $ApiDir
npm run seed:governance
if ($LASTEXITCODE -ne 0) {
    Write-Warning '    seed:governance failed - users may already exist, or check .env vars.'
}
Pop-Location

# Static file server (background)
Write-Host ''
Write-Host '==> Static file server (port 9999)' -ForegroundColor Cyan

$staticJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    npx --yes serve . -p 9999 --no-clipboard 2>&1
} -ArgumentList $RepoRoot

Write-Host "    Started (job ID $($staticJob.Id))." -ForegroundColor Green

$null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
    Stop-Job  $using:staticJob -ErrorAction SilentlyContinue
    Remove-Job $using:staticJob -ErrorAction SilentlyContinue
}

# Print summary
Write-Host ''
Write-Host '------------------------------------------------' -ForegroundColor DarkGray
Write-Host ' FHP Development Environment' -ForegroundColor White
Write-Host '------------------------------------------------' -ForegroundColor DarkGray
Write-Host ' To insert a realistic set of mock records so every dashboard tab renders'
Write-Host ' with data rather than empty states (note the extra -- before flags when using npm run):'
Write-Host ''
Write-Host ' npm run seed:mock                          # insert (idempotent — safe to re-run)'
Write-Host ' npm run seed:mock -- --clean               # delete all mock records first, then re-insert'
Write-Host ' npm run seed:mock -- --company-id <uuid>   # target a specific company (register company > get company-id from DB)'
Write-Host ''
Write-Host '------------------------------------------------' -ForegroundColor DarkGray
Write-Host ' API server       http://localhost:3000'
Write-Host ' Swagger UI       http://localhost:3000/documentation'
Write-Host ' Landing page     http://localhost:9999/landing-page.html'
Write-Host ' Candidate app    http://localhost:9999/candidate-app.html'
Write-Host ' Company dash     http://localhost:9999/company-dashboard.html'
Write-Host ' Governance dash  http://localhost:9999/governance-dashboard.html'
Write-Host ''
$GovUser   = if ($env:GOVERNANCE_USER_USERNAME)  { $env:GOVERNANCE_USER_USERNAME }  else { 'governance' }
$AdminUser = if ($env:GOVERNANCE_ADMIN_USERNAME) { $env:GOVERNANCE_ADMIN_USERNAME } else { 'admin' }
Write-Host " Governance login  username: $GovUser"
Write-Host '                   password: (see api/.env)'
Write-Host " Admin login       username: $AdminUser"
Write-Host '                   password: (see api/.env)'
Write-Host '------------------------------------------------' -ForegroundColor DarkGray
Write-Host ' Press Ctrl+C to stop.' -ForegroundColor DarkGray
Write-Host ''

# API server (foreground)
Write-Host '==> API server (port 3000)' -ForegroundColor Cyan
Push-Location $ApiDir
try {
    npm run dev
} finally {
    Pop-Location
    Stop-Job  $staticJob -ErrorAction SilentlyContinue
    Remove-Job $staticJob -ErrorAction SilentlyContinue
    Write-Host 'Stopped.' -ForegroundColor Yellow
}
