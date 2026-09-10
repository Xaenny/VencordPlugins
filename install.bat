@echo off
REM Sets up Vencord with these plugins, or updates an existing setup.
REM Double-click this file, or run it from a terminal with extra options, e.g.:
REM   install.bat -Vencord D:\Vencord
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1" %*
echo.
pause
