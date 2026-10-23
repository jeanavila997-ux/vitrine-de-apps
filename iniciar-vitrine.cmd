@echo off
chcp 65001>nul
title Vitrine de Apps
cd /d "%~dp0"
set "PORTA=4400"

curl -s -m 2 -o nul "http://127.0.0.1:%PORTA%/" >nul 2>&1
if not errorlevel 1 goto abrir

start "Vitrine de Apps - servidor" /min cmd /c "node server\index.js"

for /l %%i in (1,1,20) do (
    curl -s -m 1 -o nul "http://127.0.0.1:%PORTA%/" >nul 2>&1
    if not errorlevel 1 goto abrir
    timeout /t 1 /nobreak >nul
)

echo A Vitrine nao respondeu em 20s. Veja a janela "Vitrine de Apps - servidor".
pause
exit /b 1

:abrir
start "" "http://127.0.0.1:%PORTA%/"
exit /b 0
