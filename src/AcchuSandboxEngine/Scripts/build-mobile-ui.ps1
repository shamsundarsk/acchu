# Build Mobile UI for Asset Bundle
param(
    [string]$SourcePath = "..\..\..\..\acchu-mobile-fork\packages\customer-system",
    [string]$OutputPath = "..\MobileUI"
)

Write-Host "Building Mobile UI for Asset Bundle..."
Write-Host "Source: $SourcePath"
Write-Host "Output: $OutputPath"

# Check if source exists
if (!(Test-Path $SourcePath)) {
    Write-Error "Source path not found: $SourcePath"
    exit 1
}

# Create output directory
if (!(Test-Path $OutputPath)) {
    New-Item -ItemType Directory -Path $OutputPath -Force
}

# Build the mobile UI
Push-Location $SourcePath
try {
    Write-Host "Installing dependencies..."
    npm install

    Write-Host "Building production version..."
    npm run build

    Write-Host "Copying built files..."
    if (Test-Path "dist") {
        Copy-Item -Path "dist\*" -Destination $OutputPath -Recurse -Force
        Write-Host "Mobile UI built successfully!"
    } else {
        Write-Error "Build output not found in dist directory"
    }
}
catch {
    Write-Error "Build failed: $($_.Exception.Message)"
}
finally {
    Pop-Location
}

Write-Host "Mobile UI build complete."