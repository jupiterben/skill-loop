# Loop 外循环（Windows）— 仿 Ralph scripts/ralph/ralph.ps1
# 用法: .\loop.ps1 [-Tool agent|claude|amp] [-MaxIterations 10] [-UntilStop]

param(
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
Push-Location $CliDir
try {
    if ($UntilStop) {
        $args = @("loop", "run", "--until-stop")
    } else {
        $args = @("loop", "run", "--max-iterations", "$MaxIterations")
    }
    if ($Tool) { $args += @("--tool", $Tool) }
    if ($Workers -gt 1) { $args += @("--workers", "$Workers") }
    pnpm @args
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
