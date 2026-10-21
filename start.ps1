$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$melodiaNodeCommand = Get-Command node -ErrorAction SilentlyContinue
$melodiaNodePath = if ($melodiaNodeCommand) { $melodiaNodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $melodiaNodePath)) { throw 'Установите Node.js 22 или новее.' }
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules\vite\bin\vite.js'))) { throw 'Сначала установите зависимости командой pnpm install.' }
& $melodiaNodePath (Join-Path $PSScriptRoot 'node_modules\vite\bin\vite.js') --host 127.0.0.1
exit $LASTEXITCODE
