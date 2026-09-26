@echo off
rem start the site online - close this window to stop it
title Brilliant Institute - ONLINE (close to stop)
cd /d "%~dp0"
node scripts\host.js %*
