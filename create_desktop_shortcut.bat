@echo off
:: Create Desktop Shortcut for Windows
echo ==================================================
echo       Creating Desktop Shortcut for MultiView
echo ==================================================

:: Get the directory of this batch file
set "CURRENT_DIR=%~dp0"
set "SHORTCUT_PATH=%userprofile%\Desktop\Finance MultiView.lnk"
set "TARGET_BAT=%CURRENT_DIR%run.bat"

:: Generate shortcut via PowerShell
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$s = (New-Object -COM WScript.Shell).CreateShortcut('%SHORTCUT_PATH%'); ^
     $s.TargetPath = '%TARGET_BAT%'; ^
     $s.WorkingDirectory = '%CURRENT_DIR%'; ^
     $s.IconLocation = 'shell32.dll,170'; ^
     $s.Description = 'Launch Finance MultiView Charting Dashboard'; ^
     $s.Save()"

if exist "%SHORTCUT_PATH%" (
    echo SUCCESS: "Finance MultiView" shortcut created on your Desktop!
    echo You can now close this window and use the Desktop icon to run the app.
) else (
    echo ERROR: Failed to create shortcut. Make sure you have permission to write to your Desktop.
)
pause
