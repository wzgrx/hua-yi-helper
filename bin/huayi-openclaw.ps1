$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot
node (Join-Path $Repo 'scripts\install-openclaw-skill.js') @args

