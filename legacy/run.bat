@echo off
echo Starting Statement Utility...
echo.

:: Use Python from its install path since it may not be on PATH yet
set PYTHON="%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
set STREAMLIT="%LOCALAPPDATA%\Programs\Python\Python312\Scripts\streamlit.exe"

:: Start Ollama in the background if it's not already running
tasklist /FI "IMAGENAME eq ollama.exe" 2>NUL | find /I "ollama.exe" >NUL
if %ERRORLEVEL% NEQ 0 (
    echo Starting Ollama...
    start "" "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve
    timeout /t 3 /nobreak >NUL
)

:: Check if a model is available
echo Checking for Ollama model...
"%LOCALAPPDATA%\Programs\Ollama\ollama.exe" list 2>NUL | find "llama3.1" >NUL
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo No model found. Pulling llama3.1:8b (this is a ~4.7GB download, one-time only)...
    "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" pull llama3.1:8b
)

echo.
echo Launching dashboard at http://localhost:8501
echo.
%STREAMLIT% run app/main.py --server.headless false
