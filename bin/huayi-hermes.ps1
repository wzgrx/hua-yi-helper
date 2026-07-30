$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot
node (Join-Path $Repo 'src\hermes\cli.js') @args
