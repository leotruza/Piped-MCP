[CmdletBinding()]
param(
    [string]$NodePath = "node.exe",
    [string]$McpoPath = "mcpo.exe",
    [string]$ServerPath = (Join-Path $PSScriptRoot "src\server.js"),
    [string]$Host = "127.0.0.1",
    [int]$Port = 8083,
    [switch]$SkipPathValidation
)

$ErrorActionPreference = "Stop"

if (-not $SkipPathValidation) {
    if (-not (Test-Path -LiteralPath $ServerPath -PathType Leaf)) {
        throw "MCP server entrypoint was not found: $ServerPath"
    }
    if (-not (Get-Command $NodePath -ErrorAction SilentlyContinue)) {
        throw "Node.js executable was not found: $NodePath"
    }
    if (-not (Get-Command $McpoPath -ErrorAction SilentlyContinue)) {
        throw "MCPO executable was not found: $McpoPath"
    }
}

$env:YOUTUBE_MCP_TRANSPORT = "stdio"
$env:YOUTUBE_MCP_HOST = $Host
$env:YOUTUBE_MCP_PORT = [string]$Port

Write-Host "Starting MCPO on http://$Host`:$Port"
Write-Host "Node: $NodePath"
Write-Host "MCP server: $ServerPath"

& $McpoPath --host $Host --port $Port -- $NodePath $ServerPath
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
    throw "MCPO exited with code $exitCode"
}
