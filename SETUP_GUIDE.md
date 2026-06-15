# ZARODA SMS — Developer Setup Guide (Windows)
## Step-by-step from zero to running

---

## PREREQUISITES — Install these first

1. **Node.js 18+**  
   Download from https://nodejs.org → choose LTS version  
   Verify: open PowerShell and run `node --version`

2. **PostgreSQL 16**  
   Download from https://www.postgresql.org/download/windows/  
   During install: set password to `password` (or anything — update .env to match)  
   Verify: `psql --version`

3. **Git**  
   Download from https://git-scm.com/download/win  
   Verify: `git --version`

4. **VS Code** (already installed ✓)

---

## STEP 1 — Create the project folder

Open PowerShell and run:

```powershell
mkdir C:\Users\user\Documents\zaroda-sms
cd C:\Users\user\Documents\zaroda-sms
mkdir backend
mkdir frontend
mkdir mobile
mkdir docs
```

---

## STEP 2 — Place the files

Download all files from the Claude chat and save them into the matching folders.

The structure you need:
```
zaroda-sms/
├── backend/
│   ├── package.json          ← download from chat
│   ├── tsconfig.json         ← download from chat
│   ├── nest-cli.json         ← download from chat
│   ├── .env.example          ← download from chat
│   └── src/
│       ├── main.ts           ← download from chat
│       ├── app.module.ts     ← download from chat
│       ├── common/
│       │   └── guards/
│       │       └── jwt-auth.guard.ts
│       └── modules/
│           ├── auth/
│           │   └── auth.module.ts
│           ├── location/
│           │   └── location.module.ts
│           ├── academic/
│           │   └── academic.module.ts
│           └── stubs.module.ts
│
└── frontend/
    ├── package.json          ← download from chat
    ├── next.config.js        ← download from chat
    ├── tailwind.config.ts    ← download from chat
    ├── tsconfig.json         ← download from chat
    ├── .env.local            ← download from chat
    ├── styles/
    │   └── globals.css
    ├── lib/
    │   ├── api/client.ts
    │   └── hooks/useAuth.ts
    └── app/
        ├── layout.tsx
        ├── page.tsx
        ├── auth/
        │   ├── layout.tsx
        │   ├── login/page.tsx
        │   └── signup/page.tsx
        └── dashboard/
            ├── layout.tsx
            ├── page.tsx
            ├── academic/page.tsx
            ├── academic/attendance/page.tsx
            ├── academic/learners/page.tsx
            ├── academic/timetable/page.tsx
            ├── academic/report-cards/page.tsx
            ├── finance/page.tsx
            ├── communication/page.tsx
            ├── professional-records/page.tsx
            ├── library/page.tsx
            ├── sports/page.tsx
            ├── sports-base/page.tsx
            ├── discipline/page.tsx
            ├── settings/page.tsx
            └── help/page.tsx
```

---

## STEP 3 — Set up the database

Open **pgAdmin** (installed with PostgreSQL) or use PowerShell:

```powershell
# Open psql
psql -U postgres

# In psql, run these:
CREATE DATABASE zaroda_sms;
CREATE USER zaroda_app WITH PASSWORD 'password';
GRANT ALL PRIVILEGES ON DATABASE zaroda_sms TO zaroda_app;

\c zaroda_sms
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

# Exit psql
\q
```

---

## STEP 4 — Configure environment variables

**Backend:**
```powershell
cd C:\Users\user\Documents\zaroda-sms\backend
copy .env.example .env
```

Open `.env` in VS Code and update:
```
DATABASE_URL=postgresql://zaroda_app:password@localhost:5432/zaroda_sms
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zaroda_sms
DB_USER=zaroda_app
DB_PASS=password

JWT_SECRET=any-long-random-string-here
JWT_REFRESH_SECRET=another-different-long-random-string

# Leave these blank for now — the app works without them
# but SMS, M-Pesa, and AI won't work until you add them:
ANTHROPIC_API_KEY=
AT_API_KEY=
MPESA_CONSUMER_KEY=
```

**Frontend:** The `.env.local` should already have:
```
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3001
```
This tells the frontend where the backend is. Do not change these during local development.

---

## STEP 5 — Install dependencies

Open **two separate PowerShell windows**.

**Window 1 — Backend:**
```powershell
cd C:\Users\user\Documents\zaroda-sms\backend
npm install
```

**Window 2 — Frontend:**
```powershell
cd C:\Users\user\Documents\zaroda-sms\frontend
npm install
```

---

## STEP 6 — Start both servers

**Window 1 — Start the backend (runs on port 3000):**
```powershell
cd C:\Users\user\Documents\zaroda-sms\backend
npm run start:dev
```

You should see:
```
🚀 ZARODA SMS API running on http://localhost:3000/api/v1
📚 Health check:  http://localhost:3000/health
✅ CORS enabled for: http://localhost:3001
```

**Window 2 — Start the frontend (runs on port 3001):**
```powershell
cd C:\Users\user\Documents\zaroda-sms\frontend
npm run dev
```

You should see:
```
▲ Next.js 14
- Local:  http://localhost:3001
```

---

## STEP 7 — Verify the connection

1. Open your browser and go to: **http://localhost:3000/health**  
   You should see: `{"status":"ok","service":"zaroda-sms-api"}`

2. Open: **http://localhost:3001**  
   It should redirect to the login page.

3. Open: **http://localhost:3000/api/v1/location/counties**  
   You should see a JSON array (might be empty until you run the SQL migrations).

---

## STEP 8 — Run the SQL migrations to seed data

Download the SQL files from the chat and run them:

```powershell
psql -U zaroda_app -d zaroda_sms -f 001_auth_tenant_schema.sql
psql -U zaroda_app -d zaroda_sms -f 001b_location_migration.sql
psql -U zaroda_app -d zaroda_sms -f academic\002_academic_core_schema.sql
# ... continue for all modules
```

After running `001b_location_migration.sql`, the counties endpoint will return all 47 Kenya counties.

---

## STEP 9 — Create your first school account

1. Go to http://localhost:3001/auth/signup
2. Fill in the school name, your name, email, and password
3. Select your county, sub-county, and zone
4. Click **Create Account**
5. You are now logged in as HOI of a new school on a 14-day free trial

---

## TROUBLESHOOTING

### "Cannot connect to backend" / API calls fail
- Make sure the backend is running in Window 1 (you see the green startup message)
- Check `NEXT_PUBLIC_API_URL=http://localhost:3000` is in `frontend/.env.local`
- Try http://localhost:3000/health in your browser — if it doesn't load, the backend isn't running

### "Port 3000 already in use"
```powershell
# Find what's using port 3000:
netstat -ano | findstr :3000
# Kill it (replace PID with the number you see):
taskkill /PID <PID> /F
```

### "Cannot find module" errors in backend
```powershell
cd backend
npm install
```

### "TypeORM cannot connect to database"
- Open pgAdmin and verify zaroda_sms database exists
- Check `DB_PASS` in `.env` matches what you set during PostgreSQL install
- Make sure PostgreSQL service is running (check Windows Services)

### Frontend shows blank pages / "undefined" errors
- Open browser DevTools (F12) → Console tab
- Look for red API errors
- Make sure backend is running first

### "CORS error" in browser console
- This means backend is running but CORS is blocking the frontend
- Check `FRONTEND_URL=http://localhost:3001` is in backend `.env`
- Restart the backend after changing `.env`

---

## OPENING IN VS CODE

To open the whole project properly:
```powershell
cd C:\Users\user\Documents\zaroda-sms
code .
```

This opens the root folder. You'll see backend, frontend, and mobile all in one VS Code window.

To run both servers without separate windows, use VS Code's integrated terminal:
- Open Terminal → Split Terminal
- Left terminal: `cd backend && npm run start:dev`
- Right terminal: `cd frontend && npm run dev`

---

## API DOCUMENTATION

Once the backend is running, visit:  
**http://localhost:3000/api/docs**

This shows Swagger UI with every endpoint, their parameters, and response schemas. Your developer can test all endpoints directly from the browser here.

---

## WHAT WORKS WITHOUT EXTERNAL SERVICES

The following features work out of the box with just PostgreSQL:
- Login and signup
- School onboarding
- Learner registration
- Attendance marking
- Library management
- Discipline recording
- All dashboard views

The following require API keys in `.env`:
- **SMS** — requires `AT_API_KEY` (Africa's Talking)
- **M-Pesa** — requires `MPESA_CONSUMER_KEY` + `MPESA_CONSUMER_SECRET`
- **AI documents** — requires `ANTHROPIC_API_KEY`
- **Push notifications** — requires `FIREBASE_PROJECT_ID` + Firebase credentials

---

*ZARODA Solutions · www.zarodasolutions.app · +254 781 230 805*
