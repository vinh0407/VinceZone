@echo off
title VinceZone Studio Desktop (localhost:40704)
cd /d "%~dp0.."
set PORT=40704
if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" "electron\main.cjs"
) else (
  pnpm desktop
)
