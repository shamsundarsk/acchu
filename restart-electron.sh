#!/bin/bash

echo "🔄 Restarting Electron App..."
echo ""

# Kill any running Electron processes
echo "1. Stopping old Electron processes..."
pkill -f "acchu-mini-app" || true
pkill -f "Electron" || true
sleep 2

# Clear any cached files
echo "2. Clearing cache..."
rm -rf acchu-mini-app/node_modules/.cache 2>/dev/null || true

# Go to app directory
cd acchu-mini-app

echo "3. Starting fresh Electron app..."
echo ""
npm start

echo ""
echo "✅ Electron app restarted!"
