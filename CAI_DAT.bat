@echo off
chcp 65001 >nul
title Cubitix Studios - Cai dat thu vien
cd /d "%~dp0"
echo ===============================================================
echo    CUBITIX STUDIOS - CÀI ĐẶT THƯ VIỆN ( chỉ làm 1 lần )
echo ===============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [LỖI] Chưa cài Node.js!
  echo Vui lòng tải và cài Node.js 18+ tại: https://nodejs.org
  echo Sau đó chạy lại file này.
  echo.
  pause
  exit /b
)

echo [1/2] Đã tìm thấy Node.js:
node -v
echo.
echo [2/2] Đang cài thư viện (npm install)... vui lòng đợi...
echo.
call npm install
echo.
if errorlevel 1 (
  echo [LỖI] Cài đặt thất bại. Kiem tra ket noi mang roi thu lai.
) else (
  echo [OK] Đã cài xong! Bây giờ bạn có thể chạy bot.
  echo   - Chạy ẨN: bấm đúp START_BOT_AN_TERMINAL.vbs
  echo   - Chạy CÓ cửa sổ: bấm đúp START_BOT.bat
)
echo.
pause
