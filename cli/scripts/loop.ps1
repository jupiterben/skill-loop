# Loop 外循环（Windows）— 仿 Ralph scripts/ralph/ralph.ps1
# 用法: .\loop.ps1 [-Tool agent|claude|amp] [-MaxIterations 10] [-UntilStop]

param(
    [ValidateSet("agent", "cursor", "claude", "amp")]
    [string]$Tool = "",
    [int]$MaxIterations = 10,
    [switch]$UntilStop
)

$ErrorActionPreference = "Stop"

if (-not $env:LOOP_PROJECT_ROOT) {
    $env:LOOP_PROJECT_ROOT = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..\..")).Path
}

$CliDir = Join-Path $PSScriptRoot ".."
Push-Location $CliDir
try {
    if ($UntilStop) {
        $args = @("loop", "run", "--until-stop")
    } else {
        $args = @("loop", "run", "--max-iterations", "$MaxIterations")
    }
    if ($Tool) { $args += @("--tool", $Tool) }
    pnpm @args
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
