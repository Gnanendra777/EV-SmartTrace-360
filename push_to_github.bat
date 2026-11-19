@echo off
title Shifting Code to main & Deleting master...
color 0A
echo ========================================================
echo   EV SMARTTRACE 360 - GITHUB AUTOMATED DEPLOYMENT
echo   Target: https://github.com/Gnanendra777/EV-SmartTrace-360.git
echo   Action: Shift all code to 'main' + Delete 'master'
echo ========================================================
echo.

set "PATH=C:\Users\dell\AppData\Local\GitHubDesktop\app-3.4.20\resources\app\git\cmd;%PATH%"
cd /d "%~dp0"

echo [Step 1 of 2] Pushing all 115 files cleanly to 'main'...
git push origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo [Step 2 of 2] Deleting temporary 'master' branch from GitHub...
    git push origin --delete master
    echo.
    echo ========================================================
    echo   [SUCCESS] All code is now on 'main'!
    echo   Branch 'master' has been deleted.
    echo   View online: https://github.com/Gnanendra777/EV-SmartTrace-360
    echo ========================================================
) else (
    echo.
    echo [ERROR] Push to main failed with code %ERRORLEVEL%.
)

echo.
pause
