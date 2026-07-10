<#
.SYNOPSIS
  华医网小助手 v3.0 - Win11 一键安装/配置脚本
.DESCRIPTION
  自动检测环境、安装依赖、创建计划任务、配置Chrome用户数据
  支持三种模式: Tampermonkey(油猴) / Hermes(WSL) / PowerShell(Win11)
.PARAMETER InstallChrome
  如果Chrome未安装则自动下载 (默认: false)
.PARAMETER CreateTask
  创建Windows计划任务定时运行 (默认: false)
.PARAMETER TaskTime
  计划任务运行时间 (默认: "08:00")
.EXAMPLE
  .\setup.ps1 -InstallChrome -CreateTask -TaskTime "06:00"
#>

param(
  [switch]$InstallChrome = $false,
  [switch]$CreateTask = $false,
  [string]$TaskTime = "08:00"
)

$ErrorActionPreference = "Continue"
$ScriptVersion = "3.0.0"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  华医网小助手 v$ScriptVersion 安装脚本" -ForegroundColor Cyan
Write-Host "  Win11 环境配置" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 检测Chrome/Edge
function Find-Browser {
  Write-Host "`n[检测] 扫描已安装的浏览器..." -ForegroundColor Yellow

  $paths = @(
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  )

  foreach ($p in $paths) {
    if (Test-Path $p) {
      Write-Host "  ✅ 找到: $p" -ForegroundColor Green
      return $p
    }
  }

  Write-Host "  ❌ 未找到Chrome/Edge" -ForegroundColor Red
  return $null
}

# 安装Hermes依赖
function Install-Hermes {
  Write-Host "`n[安装] 配置Hermes(Node.js)依赖..." -ForegroundColor Yellow

  $hermesDir = Join-Path $ProjectRoot "src\hermes"
  if (-not (Test-Path $hermesDir)) {
    Write-Host "  ⚠️ Hermes目录不存在: $hermesDir" -ForegroundColor Red
    return $false
  }

  # 检查Node.js
  $nodeVersion = node --version 2>$null
  if (-not $nodeVersion) {
    Write-Host "  ⚠️ Node.js 未安装。请访问 https://nodejs.org 安装 v18+" -ForegroundColor Red
    Write-Host "  安装后重新运行此脚本" -ForegroundColor Yellow
    return $false
  }
  Write-Host "  ✅ Node.js: $nodeVersion" -ForegroundColor Green

  # 安装npm依赖
  Write-Host "  npm install (puppeteer-core)..." -ForegroundColor Gray
  Set-Location $ProjectRoot
  npm install --production 2>&1 | Out-Null

  Write-Host "  ✅ Hermes依赖安装完成" -ForegroundColor Green
  return $true
}

# 创建Chrome用户数据目录并登录
function Setup-ChromeProfile {
  Write-Host "`n[配置] Chrome用户数据目录..." -ForegroundColor Yellow

  $profileDir = Join-Path $env:USERPROFILE ".hermes\chrome-profile"
  if (-not (Test-Path $profileDir)) {
    New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
    Write-Host "  ✅ 创建: $profileDir" -ForegroundColor Green
  } else {
    Write-Host "  ✅ 已存在: $profileDir" -ForegroundColor Green
  }

  Write-Host "  ℹ️ 请手动启动Chrome登录华医网:" -ForegroundColor Cyan
  Write-Host "    chrome --user-data-dir=`"$profileDir`" https://www.91huayi.com" -ForegroundColor White

  # 自动启动Chrome让用户登录 (如果找到浏览器)
  $chromePath = Find-Browser
  if ($chromePath) {
    Write-Host "  🚀 正在启动浏览器，请登录华医网..." -ForegroundColor Cyan
    $loginUrl = "https://cme28.91huayi.com/pages/cme.aspx"
    Start-Process -FilePath $chromePath -ArgumentList "--user-data-dir=`"$profileDir`"", "--no-sandbox", $loginUrl -WindowStyle Normal
  }

  return $true
}

# 创建计划任务
function Create-ScheduledTask {
  param([string]$Time)

  Write-Host "`n[计划任务] 创建每日定时刷课任务..." -ForegroundColor Yellow

  $taskName = "华医网小助手"
  $taskDesc = "华医网全自动刷课 - 每日 $Time 自动执行"

  # 检查是否已存在
  $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "  ℹ️ 计划任务已存在: $taskName" -ForegroundColor Gray
    $overwrite = Read-Host "  是否覆盖? (y/n)"
    if ($overwrite -ne "y") { return $false }
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  }

  # Hermes脚本路径
  $hermesScript = Join-Path $ProjectRoot "src\hermes\index.js"
  if (-not (Test-Path $hermesScript)) {
    Write-Host "  ❌ Hermes脚本不存在: $hermesScript" -ForegroundColor Red
    return $false
  }

  $action = New-ScheduledTaskAction -Execute "node" -Argument "`"$hermesScript`" --mode full --headless"
  $trigger = New-ScheduledTaskTrigger -Daily -At $Time
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

  try {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
      -Principal $principal -Settings $settings -Description $taskDesc -Force
    Write-Host "  ✅ 计划任务已创建: 每日 $Time 执行" -ForegroundColor Green
    return $true
  } catch {
    Write-Host "  ❌ 创建计划任务失败: $_" -ForegroundColor Red
    return $false
  }
}

# ====== 主流程 ======
Write-Host "`n[系统信息]" -ForegroundColor Yellow
Write-Host "  OS: $([Environment]::OSVersion.VersionString)" -ForegroundColor Gray
Write-Host "  PowerShell: $($PSVersionTable.PSVersion)" -ForegroundColor Gray
Write-Host "  Project: $ProjectRoot" -ForegroundColor Gray

# 1. 检测浏览器
$browser = Find-Browser

# 2. 安装Hermes
Install-Hermes

# 3. 配置Chrome
Setup-ChromeProfile

# 4. 创建计划任务
if ($CreateTask) {
  Create-ScheduledTask -Time $TaskTime
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  安装完成!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`n📋 使用方式:" -ForegroundColor White
Write-Host "  1. Tampermonkey (油猴):" -ForegroundColor Gray
Write-Host "     安装 src\tampermonkey\hua-yi-helper.user.js" -ForegroundColor Gray
Write-Host "  2. Hermes (WSL/Node.js):" -ForegroundColor Gray
Write-Host "     cd src\hermes && node index.js --mode full" -ForegroundColor Gray
Write-Host "  3. PowerShell (Win11):" -ForegroundColor Gray
Write-Host "     node src\hermes\index.js --mode full --headless" -ForegroundColor Gray
Write-Host "  4. 计划任务已设置在每日 $TaskTime 自动执行" -ForegroundColor Gray
Write-Host "`n📚 更多帮助: README.md" -ForegroundColor Cyan
