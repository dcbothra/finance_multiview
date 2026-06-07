#!/bin/bash
# Local run script for Linux/macOS
echo "=================================================="
echo "          Starting Finance MultiView"
echo "=================================================="

# Check for Python 3
if ! command -v python3 &> /dev/null
then
    echo "ERROR: Python 3 is not installed!"
    echo "Please download and install Python 3 from https://www.python.org/"
    read -p "Press enter to exit..."
    exit 1
fi

# Setup virtual environment
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing/verifying packages..."
pip install --upgrade pip
pip install -r requirements.txt

# Open the dashboard web page automatically in the background
echo "Launching dashboard..."
(sleep 1.5 && (xdg-open http://localhost:5000 || open http://localhost:5000)) &

# Launch Flask server
python3 main.py
