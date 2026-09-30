@echo off
:: Check if the user forgot to add a commit message
if "%~1"=="" (
    echo [Error] Please provide a commit message! 
    echo Example: ship "added new landing page"
    exit /b 1
)

echo 1. Staging all project files...
git add .

echo 2. Committing changes...
git commit -m "%~1"

echo 3. Pushing code to GitHub...
git push origin main

echo 4. Manually deploying directly to Firebase...
firebase deploy

echo All steps completed successfully!
