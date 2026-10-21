@echo off
chcp 65001 >nul
title 全聯條碼查詢 APP - 本機 PWA 伺服器
echo ========================================================
echo   全聯福利中心 條碼快速查詢系統 (10月版)
echo   正在啟動本機伺服器以支援 PWA 離線安裝功能...
echo ========================================================
echo.
echo 伺服器網址: http://localhost:8080/
echo 關閉此視窗即可停止伺服器。
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$listener = New-Object System.Net.HttpListener; ^
   $port = 8080; ^
   $listener.Prefixes.Add('http://localhost:' + $port + '/'); ^
   $listener.Start(); ^
   Start-Process 'http://localhost:' + $port + '/'; ^
   Write-Host '本機伺服器運作中... 請勿關閉此視窗。' -ForegroundColor Green; ^
   $mime = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css'; '.js'='application/javascript; charset=utf-8'; '.json'='application/json'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.ico'='image/x-icon' }; ^
   while ($listener.IsListening) { ^
     $ctx = $listener.GetContext(); ^
     $path = $ctx.Request.Url.LocalPath.TrimStart('/'); ^
     if ([string]::IsNullOrEmpty($path)) { $path = 'index.html' }; ^
     $fullPath = [System.IO.Path]::Combine($pwd.Path, [System.Web.HttpUtility]::UrlDecode($path)); ^
     if ([System.IO.File]::Exists($fullPath)) { ^
       $ext = [System.IO.Path]::GetExtension($fullPath).ToLower(); ^
       $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }; ^
       $bytes = [System.IO.File]::ReadAllBytes($fullPath); ^
       $ctx.Response.ContentLength64 = $bytes.Length; ^
       $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length); ^
     } else { ^
       $ctx.Response.StatusCode = 404; ^
     }; ^
     $ctx.Response.Close(); ^
   }"
pause
