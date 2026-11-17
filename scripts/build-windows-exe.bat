@echo off
chcp 65001 >nul
echo ====================================================
echo   بناء نسخة Windows (.exe) - مساعد استعاضة التموين
echo   إعداد: أحمد حسب الله
echo ====================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [خطأ] برنامج Node.js غير مثبت. يرجى تثبيت Node.js LTS من https://nodejs.org ثم إعادة المحاولة.
  pause
  exit /b 1
)

echo [1/4] تثبيت الحزم الأساسية...
call npm install --legacy-peer-deps
if %errorlevel% neq 0 goto :error

echo [2/4] بناء واجهة التطبيق (dist)...
call npm run build
if %errorlevel% neq 0 goto :error

echo [3/4] تجهيز Electron و electron-builder بدون تعديل package.json...
call npm install --no-save --legacy-peer-deps electron electron-builder
if %errorlevel% neq 0 goto :error

echo [4/4] تغليف التطبيق إلى ملفات EXE...
call npx electron-builder --config electron/electron-builder.json --win
if %errorlevel% neq 0 goto :error

echo.
echo ====================================================
echo   تم البناء بنجاح!
echo   ستجد الملفات داخل مجلد: release-win
echo   - Tamween-Assistant-Portable.exe (تشغيل مباشر بدون تثبيت)
echo   - Tamween-Assistant-Setup.exe    (ملف تثبيت على الجهاز)
echo ====================================================
pause
exit /b 0

:error
echo.
echo [فشل البناء] حدث خطأ أثناء التجهيز. راجع الرسالة أعلاه.
pause
exit /b 1
