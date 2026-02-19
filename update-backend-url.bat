@echo off
echo ========================================
echo UPDATE BACKEND URL FOR ALL PROJECTS
echo ========================================
echo.

set /p NGROK_URL="Enter your new ngrok URL (e.g., https://unskewed-krystin-syzygial.ngrok-free.dev): "

echo.
echo Updating frontend-web...
echo VITE_API_BASE_URL=%NGROK_URL% > frontend-web\.env

echo Updating customer-deploy...
echo VITE_API_BASE_URL=%NGROK_URL% > customer-deploy\.env

echo Updating customer-system...
echo VITE_API_BASE_URL=%NGROK_URL% > acchu-mobile-fork\packages\customer-system\.env

echo.
echo ========================================
echo DEPLOYING TO VERCEL
echo ========================================
echo.

echo Deploying frontend-web...
cd frontend-web
call vercel --prod
cd ..

echo.
echo Deploying customer-deploy...
cd customer-deploy
call vercel --prod
cd ..

echo.
echo ========================================
echo DEPLOYMENT COMPLETE!
echo ========================================
echo.
echo Your apps are now using: %NGROK_URL%
echo.
pause
