@echo off
chcp 65001 >nul
title Cubitix Studios - Bot dang chay
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua cai Node.js! Xem HUONG_DAN_SU_DUNG.txt (Buoc 0).
  pause
  exit /b
)

if not exist ".env" (
  echo [LOI] Chua co file .env! Hay doi ten .env.example thanh .env va dien token.
  pause
  exit /b
)

if not exist "node_modules" (
  echo [!] Chua cai thu vien. Dang tu chay npm install...
  call npm install
)

echo ===============================================================
echo    CUBITIX STUDIOS - BOT DANG CHAY (dong cua so de tat)
echo ===============================================================
node index.js
echo.
echo [!] Bot da dung. Nhan phim bat ky de dong.
pause
