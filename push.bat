@echo off
cd /d "c:\Users\Hp\OneDrive\Desktop\TENGABIZ\NEW TENGABIZ\tengabiz-app"
git add backend/src/db.ts backend/src/routes/payments.ts src/App.tsx
git commit -m "Fix: drop NOT NULL on password_hash, sim tx auth, channel badges"
git push origin main
pause
