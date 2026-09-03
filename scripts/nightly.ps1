param(
  [string]$Duration = "8h",
  [string]$Profile = "mock-backend"
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path "node_modules")) {
  npm install
}

npx tsx src/cli.ts run --duration $Duration --profile $Profile --actions 80
$code = $LASTEXITCODE
npx tsx src/cli.ts inbox
exit $code
