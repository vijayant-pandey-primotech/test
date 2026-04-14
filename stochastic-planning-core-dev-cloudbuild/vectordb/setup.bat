@echo off
echo ========================================
echo Stochastic Planning - Setup Script
echo ========================================

echo.
echo 1. Activating virtual environment...
call venv\Scripts\activate

echo.
echo 2. Installing dependencies...
pip install -r requirements.txt

echo.
echo 3. Setting up database and processing scenarios...
python main.py

echo.
echo Setup complete! You can now run:
echo   python search_demo.py
echo.
pause 