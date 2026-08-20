@echo off
chcp 65001 >nul
title Cubitix Studios - Tat bot
echo Đang tắt tất cả tiến trình Node.js (bao gồm bot)...
taskkill /F /IM node.exe >nul 2>nul
if errorlevel 1 (
  echo Không có bot nào đang chạy.
) else (
  echo Đã tắt bot thành công.
)
echo.
timeout /t 2 >nul
