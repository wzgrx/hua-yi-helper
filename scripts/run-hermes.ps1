<#
.SYNOPSIS
  华医网小助手 v3.0 - Win11 PowerShell 启动脚本
.DESCRIPTION
  提供便捷的接口启动Hermes全自动刷课
.PARAMETER Mode
  运行模式: full/video/plan (默认: full)
.PARAMETER Speed
  播放倍速 (默认: 2)
.PARAMETER Headless
  无头模式 (默认: 有界面)
.EXAMPLE
  .\run-hermes.ps1 -Mode full -Speed 2 -Headless
  .\run-hermes.ps1 -Mode video
#>

param(
  [ValidateSet("full","video","plan","brush")]
  [string]$Mode = "full",
  [ValidateRange(1,5)]
  [int]$Speed = 2,
  [switch]$Headless = $false
)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$HermesScript = Join-Path $ProjectRoot "src\hermes\index.js"

if (-not (Test-Path $HermesScript)) {
  Write-Host "[错误] 找不到 $HermesScript" -ForegroundColor Red
  Write-Host "请确保在项目根目录运行此脚本" -ForegroundColor Yellow
  exit 1
}

# 检查Node.js
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
  Write-Host "[错误] Node.js 未安装。请访问 https://nodejs.org" -ForegroundColor Red
  exit 1
}

# 检查依赖
$nodeModules = Join-Path $ProjectRoot "node_modules"
if (-not (Test-Path $nodeModules)) {
  Write-Host "[安装] 首次运行, 安装依赖..." -ForegroundColor Yellow
  Set-Location $ProjectRoot
  npm install --production 2>&1 | Out-Null
}

$headlessArg = if ($Headless) { "--headless" } else { "" }
$fullCmd = "node `"$HermesScript`" --mode $Mode --speed $Speed $headlessArg"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  华医网小助手 v3.0" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  模式: $Mode"
Write-Host "  倍速: ${Speed}x"
Write-Host "  界面: $(if ($Headless) { '无头(后台)' } else { '有界面' })"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`n启动中..."
Write-Host ""

# 执行
Invoke-Expression $fullCmd
