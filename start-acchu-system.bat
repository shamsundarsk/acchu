@echo off
echo ========================================
echo ACCHU SYSTEM STARTUP SCRIPT
echo ========================================
echo.

echo [1/5] Starting AcchuSandboxEngine (Backend)...
cd src\AcchuSandboxEngine
start "AcchuSandboxEngine" cmd /k "dotnet run --urls=http://localhost:8080"
cd ..\..
timeout /t 5 /nobreak >nul

echo [2/5] Building Customer System...
cd acchu-mobile-fork\packages\customer-system
call npm install
call npm run build:server
echo.

echo [3/5] Starting Customer System (API + Mobile UI)...
start "Customer System" cmd /k "npm run dev"
cd ..\..\..
timeout /t 5 /nobreak >nul

echo [4/5] Starting Frontend Web Dashboard...
cd frontend-web
call npm install
start "Frontend Dashboard" cmd /k "npm run dev"
cd ..
timeout /t 3 /nobreak >nul

echo [5/5] Building Local Agent...
cd acchu-mobile-fork\packages\local-agent
call npm install
call npm run build
echo.

echo ========================================
echo ACCHU SYSTEM STARTUP COMPLETE!
echo ========================================
echo.
echo Services running on:
echo - Backend API: http://localhost:8080
echo - Customer System: http://localhost:3001
echo - Mobile UI: http://localhost:3003
echo - Shopkeeper Dashboard: http://localhost:5173
echo.
echo To start Local Agent (Electron):
echo   cd acchu-mobile-fork\packages\local-agent
echo   npm run dev
echo.
echo Press any key to exit...
pause >nul