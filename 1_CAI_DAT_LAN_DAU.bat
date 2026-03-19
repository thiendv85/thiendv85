@echo off
chcp 65001 >nul
title ATP v12 - Cài Dependencies
color 0A

echo.
echo  ╔══════════════════════════════════════╗
echo  ║     ATP v12 - Cài Đặt Lần Đầu      ║
echo  ╚══════════════════════════════════════╝
echo.

:: Kiểm tra Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [LỖI] Node.js chưa được cài!
    echo.
    echo  Vui lòng cài Node.js tại: https://nodejs.org
    echo  Tải bản LTS, cài xong chạy lại file này.
    echo.
    pause
    exit /b 1
)

echo  [OK] Node.js đã cài sẵn
echo.
echo  Đang cài thư viện... (1-2 phút)
echo.

:: Cài npm packages
node -e "require('child_process').execSync('npm install', {cwd: __dirname, stdio: 'inherit'})"

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  [LỖI] Cài đặt thất bại!
    pause
    exit /b 1
)

echo.
echo  ╔══════════════════════════════════════╗
echo  ║   Cài đặt hoàn tất! Bây giờ hãy:  ║
echo  ║   Double-click vào CHAY_APP.bat     ║
echo  ╚══════════════════════════════════════╝
echo.
pause
