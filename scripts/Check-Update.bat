@echo off
title VMark Auto-Updater
cd /d "D:\VMark"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\VMark\auto-updater.ps1"
echo.
pause
