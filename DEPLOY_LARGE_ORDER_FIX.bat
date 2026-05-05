@echo off
echo [ATP DEPLOY] Dang chuan bi deploy ban toi uu don hang lon...
git add .
git commit -m "Optimize large order approval flow: async building, client-side compression, and progress bar"
git push
echo [ATP DEPLOY] Da gui len GitHub/Vercel thanh cong!
pause
