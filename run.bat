@echo off
:: Local run script for Windows
echo ==================================================
echo           Starting Finance MultiView
echo ==================================================

:: Check for Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed!
    echo Please download and install Python from https://www.python.org/
    echo (Make sure to check "Add Python to PATH" during installation)
    pause
    exit /b
)

:: Setup virtual environment
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)

:: Activate virtual environment
call venv\Scripts\activate

:: Install dependencies
echo Installing/verifying packages...
python -m pip install --upgrade pip
pip install -r requirements.txt

:: Open the dashboard web page automatically
echo Launching dashboard...
start "" http://localhost:5000

:: Launch Flask server
python main.py
pause
