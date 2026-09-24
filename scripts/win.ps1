#Requires -Version 5.1
<#
.SYNOPSIS
  Refresh PATH and run common project commands on Windows.

.EXAMPLE
  .\scripts\win.ps1 path
  .\scripts\win.ps1 bootstrap
  .\scripts\win.ps1 dev
#>
param(
  [Parameter(Position = 0)]
  [ValidateSet('path', 'bootstrap', 'setup', 'infra', 'db', 'dev', 'dev-api', 'dev-web', 'check')]
  [string]$Command = 'path'
)

$ErrorActionPreference = 'Stop'

function Refresh-Path {
  $machine = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [System.Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"

  $extras = @(
    "${env:ProgramFiles}\nodejs",
    "${env:ProgramFiles}\Docker\Docker\resources\bin",
    "${env:LocalAppData}\Programs\Docker\Docker\resources\bin"
  )
  foreach ($p in $extras) {
    if ((Test-Path $p) -and ($env:Path -notlike "*$p*")) {
      $env:Path = "$p;$env:Path"
    }
  }
}

function Assert-Cmd([string]$Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "'$Name' not found on PATH. Close this terminal, open a new one, and ensure Docker Desktop / Node.js are installed. Or reboot once after install."
  }
  Write-Host "OK $Name -> $($cmd.Source)" -ForegroundColor Green
}

function Invoke-Pnpm {
  param([Parameter(Mandatory = $true)][string[]]$PnpmArgs)
  Assert-Cmd 'node'
  Assert-Cmd 'npx'
  Write-Host "> npx pnpm@9.15.0 $($PnpmArgs -join ' ')" -ForegroundColor Cyan
  & npx --yes pnpm@9.15.0 @PnpmArgs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Wait-Docker {
  Assert-Cmd 'docker'
  $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  docker info 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { return }

  if (Test-Path $desktop) {
    Write-Host "Starting Docker Desktop..." -ForegroundColor Cyan
    Start-Process $desktop | Out-Null
  }

  Write-Host "Waiting for Docker engine (can take 1-2 minutes)..." -ForegroundColor Cyan
  for ($i = 1; $i -le 60; $i++) {
    Start-Sleep -Seconds 3
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Docker engine is ready." -ForegroundColor Green
      return
    }
    Write-Host "  attempt $i/60..."
  }
  throw "Docker Desktop did not become ready. Open it manually, wait until it says Engine running, then re-run."
}

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
Refresh-Path

switch ($Command) {
  'path' {
    Assert-Cmd 'node'
    Assert-Cmd 'npx'
    try {
      Assert-Cmd 'docker'
      docker info 2>$null | Out-Null
      if ($LASTEXITCODE -ne 0) {
        Write-Host "docker CLI found, but engine is not running yet. Start Docker Desktop." -ForegroundColor Yellow
        exit 1
      }
    } catch {
      Write-Host $_.Exception.Message -ForegroundColor Yellow
      exit 1
    }
    Write-Host "PATH looks good." -ForegroundColor Green
  }
  'setup' {
    Invoke-Pnpm -PnpmArgs @('setup')
  }
  'infra' {
    Wait-Docker
    docker compose up -d postgres redis
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
  'db' {
    Invoke-Pnpm -PnpmArgs @('db:setup')
  }
  'bootstrap' {
    Wait-Docker
    Invoke-Pnpm -PnpmArgs @('setup')
    docker compose up -d postgres redis
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Start-Sleep -Seconds 8
    Invoke-Pnpm -PnpmArgs @('db:setup')
    Write-Host "`nBootstrap done. Run: .\scripts\win.ps1 dev" -ForegroundColor Green
  }
  'dev' {
    Invoke-Pnpm -PnpmArgs @('dev')
  }
  'dev-api' {
    Invoke-Pnpm -PnpmArgs @('dev:api')
  }
  'dev-web' {
    Invoke-Pnpm -PnpmArgs @('dev:web')
  }
  'check' {
    Invoke-Pnpm -PnpmArgs @('check')
  }
}
