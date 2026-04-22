@echo off
REM Reels Factory Studio — стартер Electron-приложения.
REM Дабл-клик запустит native-окно Studio.
REM Закрытие окна — полное завершение (Electron + сервер).

cd /d "%~dp0"
start "" "%~dp0node_modules\.bin\electron.cmd" "%~dp0"
exit /b 0
