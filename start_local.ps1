param(
    [int]$Port = 8080,
    [switch]$SkipScrape
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

if ($SkipScrape) {
    & "$ProjectRoot\run_scrape.ps1" -ServeOnly -Port $Port
} else {
    & "$ProjectRoot\run_scrape.ps1" -Serve -Port $Port
}
