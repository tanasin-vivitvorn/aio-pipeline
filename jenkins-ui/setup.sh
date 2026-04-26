#!/bin/bash

echo "🚀 Jenkins UI Setup Script"
echo "=========================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

echo "✅ Node.js $(node --version) detected"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm and try again."
    exit 1
fi

echo "✅ npm $(npm --version) detected"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"
echo ""

# Create .env.local if it doesn't exist
if [ ! -f .env.local ]; then
    echo "📝 Creating .env.local file..."
    cp .env.example .env.local
    
    echo ""
    echo "⚙️  Please configure your Jenkins credentials in .env.local:"
    echo ""
    echo "Required environment variables:"
    echo "  - JENKINS_URL: Your Jenkins server URL (e.g., http://localhost:8080)"
    echo "  - JENKINS_USERNAME: Your Jenkins username"
    echo "  - JENKINS_TOKEN: Your Jenkins API token"
    echo ""
    echo "To get your Jenkins API token:"
    echo "  1. Log into Jenkins"
    echo "  2. Click your username → Configure"
    echo "  3. Scroll to 'API Token' section"
    echo "  4. Click 'Add new Token'"
    echo "  5. Copy the generated token"
    echo ""
    
    read -p "Press Enter to open .env.local in your default editor..."
    ${EDITOR:-nano} .env.local
else
    echo "✅ .env.local already exists"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the development server, run:"
echo "  npm run dev"
echo ""
echo "Then open http://localhost:3000 in your browser"
echo ""
echo "For production build:"
echo "  npm run build"
echo "  npm start"
echo ""
