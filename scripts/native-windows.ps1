#Requires -Version 5.1
<#
.SYNOPSIS
  Run the app WITHOUT Docker.

  Modes:
    .\scripts\native-windows.ps1 hosted   # recommended when installers fail
    .\scripts\native-windows.ps1 local    # try local PostgreSQL via winget

  If local install fails (403), use hosted (Neon/Supabase free tier).
#>
param(
  [Parameter(Position = 0)]
  [ValidateSet('hosted', 'local', 'auto')]
  [string]$Mode = 'auto'
)

$ErrorActionPreference = 'Stop'

function Refresh-Path {
  $machine = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [System.Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
  foreach ($p in @(
      "${env:ProgramFiles}\nodejs",
      "${env:ProgramFiles}\PostgreSQL\18\bin",
      "${env:ProgramFiles}\PostgreSQL\17\bin",
      "${env:ProgramFiles}\PostgreSQL\16\bin"
    )) {
    if ((Test-Path $p) -and ($env:Path -notlike "*$p*")) { $env:Path = "$p;$env:Path" }
  }
}

function Find-Psql {
  $cmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($ver in @('18', '17', '16', '15')) {
    $candidate = Join-Path ${env:ProgramFiles} "PostgreSQL\$ver\bin\psql.exe"
    if (Test-Path $candidate) { return $candidate }
  }
  return $null
}

function Ensure-EnvFiles {
  if (-not (Test-Path .env)) { Copy-Item .env.example .env }
  $text = Get-Content .env -Raw
  if ($text -notmatch '(?m)^REDIS_DISABLED=') {
    Add-Content .env "`nREDIS_DISABLED=true"
  } elseif ($text -notmatch '(?m)^REDIS_DISABLED=true') {
    $text = $text -replace '(?m)^REDIS_DISABLED=.*$', 'REDIS_DISABLED=true'
    Set-Content .env $text -NoNewline
  }
  node .\scripts\setup.mjs env
}

function Set-DatabaseUrl([string]$Url) {
  $lines = Get-Content .env
  $updated = $false
  $out = foreach ($line in $lines) {
    if ($line -match '^DATABASE_URL=') {
      $updated = $true
      "DATABASE_URL=$Url"
    } else {
      $line
    }
  }
  if (-not $updated) { $out += "DATABASE_URL=$Url" }
  Set-Content .env ($out -join "`n")
  node .\scripts\setup.mjs env
}

function Invoke-DbSetup {
  Write-Host "Installing / generating / migrating / seeding..." -ForegroundColor Cyan
  npx --yes pnpm@9.15.0 setup
  npx --yes pnpm@9.15.0 db:setup
}

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
Refresh-Path

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js not found. Install Node LTS, open a new terminal, re-run."
}

Ensure-EnvFiles

if ($Mode -eq 'auto') {
  if (Find-Psql) { $Mode = 'local' }
  else { $Mode = 'hosted' }
}

Write-Host "== Native Windows bootstrap ($Mode) ==" -ForegroundColor Cyan

if ($Mode -eq 'hosted') {
  Write-Host ""
  Write-Host "Local Postgres installer is unavailable/blocked on this machine." -ForegroundColor Yellow
  Write-Host "Use a free hosted Postgres (Neon recommended):" -ForegroundColor Yellow
  Write-Host "  1) Open https://neon.tech and create a free project" -ForegroundColor White
  Write-Host "  2) Copy the connection string (URI)" -ForegroundColor White
  Write-Host "  3) Paste it below" -ForegroundColor White
  Write-Host ""
  $url = Read-Host "DATABASE_URL"
  if (-not $url -or $url -notmatch '^postgres(ql)?://') {
    throw "A valid postgres:// or postgresql:// URL is required."
  }
  # Neon often needs sslmode
  if ($url -notmatch 'sslmode=') {
    if ($url -match '\?') { $url = "$url&sslmode=require" }
    else { $url = "$url?sslmode=require" }
  }
  Set-DatabaseUrl $url
  Invoke-DbSetup
  Write-Host ""
  Write-Host "Done. Start the app with:" -ForegroundColor Green
  Write-Host "  .\scripts\win.ps1 dev" -ForegroundColor Green
  Write-Host "Login: admin@inventory.local / Admin123!" -ForegroundColor Green
  exit 0
}

# ---- local mode ----
$psql = Find-Psql
if (-not $psql) {
  Write-Host "Trying winget PostgreSQL 16 install..." -ForegroundColor Yellow
  Write-Host "(If this hits HTTP 403, cancel and re-run: .\scripts\native-windows.ps1 hosted)" -ForegroundColor Yellow
  $install = winget install PostgreSQL.PostgreSQL.16 --accept-package-agreements --accept-source-agreements
  Refresh-Path
  $psql = Find-Psql
  if (-not $psql) {
    Write-Host ""
    Write-Host "Local install failed or incomplete." -ForegroundColor Red
    Write-Host "Re-run with hosted mode instead:" -ForegroundColor Yellow
    Write-Host "  .\scripts\native-windows.ps1 hosted" -ForegroundColor Green
    exit 1
  }
}

Write-Host "OK psql -> $psql" -ForegroundColor Green
if (-not $env:PGPASSWORD) {
  Write-Host "Enter the PostgreSQL 'postgres' superuser password from install:" -ForegroundColor Yellow
  $secure = Read-Host "postgres password" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
}

& $psql -U postgres -h localhost -d postgres -v ON_ERROR_STOP=1 -c "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'inventory') THEN CREATE ROLE inventory LOGIN PASSWORD 'inventory'; END IF; END `$`$;"
& $psql -U postgres -h localhost -d postgres -v ON_ERROR_STOP=1 -c "SELECT 'CREATE DATABASE inventory OWNER inventory' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'inventory')\gexec"
& $psql -U postgres -h localhost -d postgres -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON DATABASE inventory TO inventory;"

Set-DatabaseUrl "postgresql://inventory:inventory@localhost:5432/inventory?schema=public"
Invoke-DbSetup

Write-Host ""
Write-Host "Local setup complete. Run: .\scripts\win.ps1 dev" -ForegroundColor Green
