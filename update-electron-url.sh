#!/bin/bash

# Script to update Electron app with deployed URL

echo "🚀 Update Electron App with Deployed URL"
echo "========================================"
echo ""

# Ask for the deployed URL
read -p "Enter your deployed Vercel URL (e.g., https://acchu-xxxxx.vercel.app): " DEPLOYED_URL

if [ -z "$DEPLOYED_URL" ]; then
    echo "❌ Error: URL cannot be empty"
    exit 1
fi

# Validate URL format
if [[ ! "$DEPLOYED_URL" =~ ^https?:// ]]; then
    echo "❌ Error: URL must start with http:// or https://"
    exit 1
fi

echo ""
echo "📝 Creating .env file for Electron app..."

# Create .env file for Electron app
cat > acchu-mini-app/.env << EOF
# Deployed URLs
FRONTEND_URL=$DEPLOYED_URL
BACKEND_URL=$DEPLOYED_URL

# Local development fallback
LOCAL_FRONTEND_URL=http://localhost:3003
LOCAL_BACKEND_URL=http://localhost:3001
EOF

echo "✅ Created acchu-mini-app/.env"
echo ""

# Update main.js to use environment variables
echo "📝 Updating main.js to use environment variables..."

# Backup original file
cp acchu-mini-app/main.js acchu-mini-app/main.js.backup

# Update the QR code generation section
sed -i.bak "s|const customerUrl = \`http://\${localIP}:3003\`;|const customerUrl = process.env.FRONTEND_URL || \`http://\${localIP}:3003\`;|g" acchu-mini-app/main.js

# Update BACKEND_URL
sed -i.bak "s|const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';|const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';|g" acchu-mini-app/main.js

echo "✅ Updated main.js"
echo ""

echo "🎉 Done! Your Electron app is now configured to use:"
echo "   Frontend: $DEPLOYED_URL"
echo "   Backend:  $DEPLOYED_URL"
echo ""
echo "📱 Next steps:"
echo "   1. Restart your Electron app"
echo "   2. Click 'Show QR Code'"
echo "   3. Scan with your phone"
echo "   4. Test the complete workflow!"
echo ""
echo "💾 Backup saved to: acchu-mini-app/main.js.backup"
