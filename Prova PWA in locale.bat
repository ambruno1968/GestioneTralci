@echo off
title GestionaleTralci - Prova PWA
cd /d "%~dp0"
node build-pwa.js
echo.
echo ========================================================
echo   GestionaleTralci - Progressive Web App (PWA)
echo   Avvio server di test su: http://localhost:8081
echo   Premi CTRL+C per arrestare il server
echo ========================================================
echo.
start "" http://localhost:8081
node serve.js

