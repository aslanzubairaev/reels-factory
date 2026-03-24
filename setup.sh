#!/bin/bash

echo "=== Reels Factory — Setup ==="
echo ""

ERRORS=0

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found. Install Node.js 18+ from https://nodejs.org"
    ERRORS=1
else
    NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo "ERROR: Node.js 18+ required. Current version: $(node -v)"
        ERRORS=1
    else
        echo "  Node.js $(node -v) — OK"
    fi
fi

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 not found. Install Python 3.9+ from https://python.org"
    ERRORS=1
else
    PYTHON_VERSION=$(python3 -c 'import sys; print(sys.version_info.minor)')
    if [ "$PYTHON_VERSION" -lt 9 ]; then
        echo "ERROR: Python 3.9+ required. Current version: $(python3 --version)"
        ERRORS=1
    else
        echo "  Python $(python3 --version 2>&1) — OK"
    fi
fi

# Check pip3
if ! command -v pip3 &> /dev/null; then
    echo "ERROR: pip3 not found. Install pip: python3 -m ensurepip"
    ERRORS=1
else
    echo "  pip3 — OK"
fi

# Check FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "ERROR: FFmpeg not found. Install FFmpeg:"
    echo "  macOS:   brew install ffmpeg"
    echo "  Ubuntu:  sudo apt install ffmpeg"
    echo "  Windows: https://ffmpeg.org/download.html"
    ERRORS=1
else
    echo "  FFmpeg $(ffmpeg -version 2>&1 | head -1 | awk '{print $3}') — OK"
fi

if [ "$ERRORS" -eq 1 ]; then
    echo ""
    echo "Fix the errors above and run setup.sh again."
    exit 1
fi

echo ""

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
npm install
echo ""

# Install Python dependencies
echo "Installing Python dependencies..."
pip3 install -r requirements.txt
echo ""

# Create .env from template if not exists
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example — fill in your API keys!"
else
    echo ".env already exists — skipping"
fi

# Create directories
mkdir -p projects history config

# Initialize history.json if not exists
if [ ! -f history/history.json ]; then
    echo '{"projects":[]}' > history/history.json
    echo "Initialized history/history.json"
fi

echo "Directories created."

echo ""
echo "========================================="
echo "  Setup complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Open .env and add your API keys:"
echo "     - GEMINI_API_KEY  (aistudio.google.com — for photo + video)"
echo "     - PIAPI_KEY       (piapi.ai — for Seedance video)"
echo "     - ANTHROPIC_API_KEY (console.anthropic.com — for text)"
echo ""
echo "  IMPORTANT: Enable billing in Google Cloud Console"
echo "  for image generation to work!"
echo ""
echo "  2. Open Cursor, launch Claude Code"
echo "  3. Type: I want to create a Reel"
echo ""
echo "To start the studio:"
echo "  node studio/server.js"
echo "  Then open http://localhost:3000"
echo ""
