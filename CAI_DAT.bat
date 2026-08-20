@echo off
chcp 65001 >nul
title Cubitix Studios - Cai dat thu vien
cd /d "%~dp0"
echo ===============================================================
echo    CUBITIX STUDIOS - CAI DAT THU VIEN (chi lam 1 lan)
echo ===============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua cai Node.js!
  echo Vui long tai va cai Node.js 18+ tai: https://nodejs.org
  echo Sau do chay lai file nay.
  echo.
  pause
  exit /b
)

echo [1/2] Da tim thay Node.js:
node -v
echo.
echo [2/2] Dang cai thu vien (npm install)... vui long doi...
echo.
call npm install
echo.
if errorlevel 1 (
  echo [LOI] Cai dat that bai. Kiem tra ket noi mang roi thu lai.
) else (
  echo [OK] Da cai xong! Bay gio ban co the chay bot.
  echo   - Chay AN: bam dup START_BOT_AN_TERMINAL.vbs
  echo   - Chay CO cua so: bam dup START_BOT.bat
)
echo.
pause
