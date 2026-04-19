param(
  [string]$TargetRoot = "C:\Users\ASUS\dev",
  [switch]$InstallDependencies
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$targetPath = Join-Path $TargetRoot (Split-Path $repoRoot -Leaf)

New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null

$robocopyArgs = @(
  $repoRoot
  $targetPath
  "/E"
  "/XD", "node_modules", ".git", ".shopify", "build", ".react-router", ".cursor", ".gemini"
  "/XF", "npm-debug.log"
)

& robocopy @robocopyArgs | Out-Null

if ($LASTEXITCODE -gt 7) {
  throw "robocopy failed with exit code $LASTEXITCODE"
}

if ($InstallDependencies) {
  Push-Location $targetPath
  try {
    & npm.cmd ci
  }
  finally {
    Pop-Location
  }
}

Write-Output "Safe workspace ready at: $targetPath"
