@echo off
chcp 65001 >nul
title Cubitix Studios - Bot đang chạy
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [Lỗi] Chưa cài Node.js! Xem HUONG_DAN_SU_DUNG.txt (Bước 0).
  pause
  exit /b
)

if not exist ".env" (
  echo [Lỗi] Chưa có file .env! Hãy đổi tên .env.example thành .env và điền token.
  pause
  exit /b
)

if not exist "node_modules" (
  echo [!] Chưa cài thư viện. Đang tự chạy npm install...
  call npm install
)

echo ===============================================================
echo    CUBITIX STUDIOS - BOT DANG CHAY (dong cua so de tat)
echo ===============================================================
node index.js
echo.
echo [!] Bot đã dừng. Nhấn phím bất kỳ để đóng.
pause
