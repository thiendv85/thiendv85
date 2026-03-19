@echo off
cd /d "%~dp0"
start "" "http://localhost:3000/"
node node_modules/vite/bin/vite.js --port 3000
pause
