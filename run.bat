@echo off
:: Local run script for Windows
echo ==================================================
echo           Starting Finance MultiView
echo ==================================================

:: Create Desktop Shortcut if it does not exist yet
set "SHORTCUT_PATH=%userprofile%\Desktop\Finance MultiView.lnk"
if not exist "%SHORTCUT_PATH%" (
    echo Creating Desktop Shortcut...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$s = (New-Object -COM WScript.Shell).CreateShortcut('%SHORTCUT_PATH%'); ^
         $s.TargetPath = '%~dp0run.bat'; ^
         $s.WorkingDirectory = '%~dp0'; ^
         $s.IconLocation = 'shell32.dll,170'; ^
         $s.Description = 'Launch Finance MultiView Charting Dashboard'; ^
         $s.Save()"
    echo Desktop shortcut successfully created!
)

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
