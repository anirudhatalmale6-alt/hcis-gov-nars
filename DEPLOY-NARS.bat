@echo off
REM ============================================================
REM  NARS - Government box
REM
REM  Installs the NARS application alongside HCIS. Assessors
REM  work in NARS; a completed assessment then appears in HCIS
REM  under Needs Assessment.
REM
REM  The database side went on with the catch-up. This is the
REM  application itself, which was not in that package.
REM
REM  Right-click this file and choose "Run as administrator".
REM ============================================================
setlocal
set HERE=%~dp0

if not exist "%HERE%deploy-nars.ps1" (
  echo.
  echo   ------------------------------------------------------------
  echo   This is not unpacked.
  echo.
  echo   deploy-nars.ps1 is not next to this file. Right-click the
  echo   zip, choose Extract All, put it somewhere like C:\NARS_install,
  echo   then run this from THAT folder.
  echo   ------------------------------------------------------------
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%deploy-nars.ps1"

echo.
pause
