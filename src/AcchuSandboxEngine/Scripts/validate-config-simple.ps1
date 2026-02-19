param([string]$ConfigFile = "appsettings.json")

Write-Host "ACCHU Sandbox Engine - Configuration Validation" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServiceDir = Split-Path -Parent $ScriptDir
$FullConfigPath = Join-Path $ServiceDir $ConfigFile

Write-Host "Configuration File: $FullConfigPath" -ForegroundColor Yellow
Write-Host ""

if (-not (Test-Path $FullConfigPath)) {
    Write-Host "ERROR: Configuration file not found: $FullConfigPath" -ForegroundColor Red
    exit 1
}

try {
    $config = Get-Content $FullConfigPath -Raw | ConvertFrom-Json
    Write-Host "JSON syntax is valid" -ForegroundColor Green
} catch {
    Write-Host "JSON syntax error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$requiredSections = @("Logging", "Api", "Sandbox", "Print", "Security")
$missingSections = @()

foreach ($section in $requiredSections) {
    if (-not $config.$section) {
        $missingSections += $section
    }
}

if ($missingSections.Count -gt 0) {
    Write-Host "Missing required sections: $($missingSections -join ', ')" -ForegroundColor Red
    exit 1
} else {
    Write-Host "All required sections present" -ForegroundColor Green
}

$errors = @()

if ($config.Security) {
    if (-not $config.Security.JwtSecretKey) {
        $errors += "JWT secret key is missing"
    } elseif ($config.Security.JwtSecretKey -match "CHANGE-THIS") {
        $errors += "JWT secret key must be changed from default value"
    } elseif ($config.Security.JwtSecretKey.Length -lt 32) {
        $errors += "JWT secret key must be at least 32 characters"
    }
}

if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "Errors:" -ForegroundColor Red
    foreach ($error in $errors) {
        Write-Host "  $error" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Configuration validation FAILED" -ForegroundColor Red
    exit 1
} else {
    Write-Host ""
    Write-Host "Configuration validation PASSED" -ForegroundColor Green
    exit 0
}