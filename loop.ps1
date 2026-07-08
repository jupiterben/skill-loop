# Loop 快捷脚本（Windows）
# 日常命令: .\loop.ps1 status | next | complete US-001 | dashboard | dashboard dev | help ...
# 持续循环: .\loop.ps1 watch [-Tool agent] [-Workers 3]（监听 Story，不退出的）
# 有限迭代: .\loop.ps1 [-Tool agent|claude|amp] [-MaxIterations 10] [-UntilStop]（须显式传参）

param(
    [Parameter(Position=0)]
    [string]$Command = "",
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Rest = @(),
    [ValidateSet("agent", "cursor", "claude", "amp")]
    [string]$Tool = "",
    [int]$MaxIterations = 10,
    [int]$Workers = 1,
    [switch]$UntilStop
)

$ErrorActionPreference = "Stop"

function Get-LoopProjectRoot {
    param([string]$ScriptRoot)
    $normalized = $ScriptRoot -replace '\\', '/'
    if ($normalized -match '/\.cursor/skills/loop$') {
        return (Resolve-Path (Join-Path $ScriptRoot "../../..")).Path
    }
    return $ScriptRoot
}

if (-not $env:LOOP_PROJECT_ROOT) {
    $env:LOOP_PROJECT_ROOT = Get-LoopProjectRoot -ScriptRoot $PSScriptRoot
}

$CliDir = Join-Path $PSScriptRoot "cli"
$LoopCli = Join-Path $CliDir "dist/cli.js"

function Invoke-LoopCli {
    if (-not (Test-Path $LoopCli)) {
        Write-Error "未找到 $LoopCli，请先在 cli 目录执行: pnpm install && pnpm build"
    }
    & node $LoopCli @args
    exit $LASTEXITCODE
}

if ($Command) {
    $cliArgs = @($Command) + $Rest
    Invoke-LoopCli @cliArgs
}

$explicitRun = $UntilStop -or $Tool -or
    $PSBoundParameters.ContainsKey('MaxIterations') -or
    $PSBoundParameters.ContainsKey('Workers')
if (-not $explicitRun) {
    Invoke-LoopCli help
}

if ($UntilStop) {
    $runArgs = @("run", "--until-stop")
} else {
    $runArgs = @("run", "--max-iterations", "$MaxIterations")
}
if ($Tool) { $runArgs += @("--tool", $Tool) }
if ($Workers -gt 1) { $runArgs += @("--workers", "$Workers") }
Invoke-LoopCli @runArgs
