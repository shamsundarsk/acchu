@echo off
REM Script to update Electron app with deployed URL

echo.
echo ========================================
echo Update Electron App with Deployed URL
echo ========================================
echo.

set /p DEPLOYED_URL="Enter your deployed Vercel URL (e.g., https://acchu-xxxxx.vercel.app): "

if "%DEPLOYED_URL%"=="" (
    echo Error: URL cannot be empty
    exit /b 1
)

echo.
echo Creating .env file for Electron app...

REM Create .env file for Electron app
(
echo # Deployed URLs
echo FRONTEND_URL=%DEPLOYED_URL%
echo BACKEND_URL=%DEPLOYED_URL%
echo.
echo # Local development fallback
echo LOCAL_FRONTEND_URL=http://localhost:3003
echo LOCAL_BACKEND_URL=http://localhost:3001
) > acchu-mini-app\.env

echo Created acchu-mini-app\.env
echo.

echo Done! Your Electron app is now configured to use:
echo    Frontend: %DEPLOYED_URL%
echo    Backend:  %DEPLOYED_URL%
echo.
echo Next steps:
echo    1. Update acchu-mini-app/main.js manually to use process.env.FRONTEND_URL
echo    2. Restart your Electron app
echo    3. Click 'Show QR Code'
echo    4. Scan with your phone
echo    5. Test the complete workflow!
echo.

pause
