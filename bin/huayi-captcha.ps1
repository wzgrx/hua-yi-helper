$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot
node (Join-Path $Repo 'src\hermes\captcha-cli.js') @args
