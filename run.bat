@echo off
:: Bulletproof Local run script for Windows
echo ==================================================
echo           Starting Finance MultiView
echo ==================================================

:: Get current directory (with trailing slash)
set "CURRENT_DIR=%~dp0"

:: Create Desktop Shortcut if it does not exist yet (handles OneDrive, spaces, and special characters)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$desktop = [Environment]::GetFolderPath('Desktop'); ^
     $shortcutPath = Join-Path $desktop 'Finance MultiView.lnk'; ^
     if (-not (Test-Path $shortcutPath)) { ^
         Write-Host 'Creating Desktop Shortcut...'; ^
         $s = (New-Object -COM WScript.Shell).CreateShortcut($shortcutPath); ^
         $s.TargetPath = Join-Path $env:CURRENT_DIR 'run.bat'; ^
         $s.WorkingDirectory = $env:CURRENT_DIR; ^
         $s.IconLocation = 'shell32.dll,170'; ^
         $s.Description = 'Launch Finance MultiView Charting Dashboard'; ^
         $s.Save(); ^
         Write-Host 'Desktop shortcut successfully created!'; ^
     }"

:: Check if Python is installed and fully runnable (prevents Windows Store alias trap)
python -c "import sys" >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not configured in your PATH!
    echo Please download and install Python 3 from https://www.python.org/
    echo (Crucial: Check the "Add Python to PATH" box during installation)
    pause
    exit /b
)

:: Setup virtual environment inside the script folder
if not exist "%CURRENT_DIR%venv" (
    echo Creating virtual environment...
    python -m venv "%CURRENT_DIR%venv"
)

:: Activate virtual environment
call "%CURRENT_DIR%venv\Scripts\activate.bat"

:: Install dependencies
echo Installing/verifying packages...
python -m pip install --upgrade pip
pip install -r "%CURRENT_DIR%requirements.txt"

:: Open the dashboard web page automatically
echo Launching dashboard...
start "" http://localhost:5000

:: Launch Flask server
python "%CURRENT_DIR%main.py"
pause
