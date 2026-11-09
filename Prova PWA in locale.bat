@echo off
title Registro di Chiesa - Prova PWA
cd /d "%~dp0"
node build-pwa.js
echo.
echo ========================================================
echo   Registro di Chiesa - Progressive Web App (PWA)
echo   Avvio server di test su: http://localhost:8080
echo   Premi CTRL+C per arrestare il server
echo ========================================================
echo.
start "" http://localhost:8080
node serve.js

