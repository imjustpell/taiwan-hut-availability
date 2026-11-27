param(
    [int]$MonthsAhead = 2,
    [double]$Interval = 1.5,
    [switch]$Serve,
    [switch]$ServeOnly,
    [int]$Port = 8080,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$PythonExe = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    $PythonExe = "python"
}

$CliArgs = @("run_scrape.py", "--months-ahead", $MonthsAhead, "--interval", $Interval, "--port", $Port)
if ($Serve) { $CliArgs += "--serve" }
if ($ServeOnly) { $CliArgs += "--serve-only" }
if ($NoBrowser) { $CliArgs += "--no-browser" }

& $PythonExe @CliArgs
