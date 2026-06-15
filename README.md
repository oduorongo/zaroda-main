# ZARODA School Management System

Kenya CBC/CBE-aligned school management platform.

**INNOVATIVE. RELIABLE. FORWARD.**

---

## Quick Start

### 1. Backend (runs on port 3000)
```bash
cd backend
cp .env.example .env        # edit DB credentials
npm install
npm run start:dev
```

### 2. Frontend (runs on port 3001)
```bash
cd frontend
npm install
npm run dev
```

### 3. Seed demo data
```bash
cd backend
node seed.js
```

### 4. Login at http://localhost:3001

| Role | Email | Password |
|------|-------|----------|
| HOI | hoi@demo.zaroda.app | Demo@1234 |
| Teacher | teacher@demo.zaroda.app | Demo@1234 |
| Bursar | bursar@demo.zaroda.app | Demo@1234 |
| Parent | parent@demo.zaroda.app | Demo@1234 |

---

## Project Structure

```
ZARODA/
├── backend/                  NestJS API (port 3000)
│   ├── src/                  Application source
│   │   ├── main.ts           Entry point
│   │   ├── app.module.ts     Root module
│   │   ├── common/           Guards, decorators
│   │   └── modules/          Feature modules
│   ├── database/
│   │   ├── migrations/       SQL schema files (run in order)
│   │   └── seeds/            Demo data
│   ├── package.json
│   ├── .env.example          Copy to .env and fill in
│   └── seed.js               Run to create demo accounts
│
├── frontend/                 Next.js 14 (port 3001)
│   ├── app/                  Pages (App Router)
│   │   ├── auth/             Login, Signup
│   │   └── dashboard/        All module pages
│   ├── components/           Reusable UI components
│   ├── lib/                  API client, auth hook
│   ├── public/               Static assets, user guide
│   ├── styles/               Global CSS
│   ├── package.json
│   └── .env.local            API URL config
│
├── mobile/                   Flutter (4 app flavors)
│   ├── lib/
│   │   ├── core/             Theme, services
│   │   ├── shared/           Reusable widgets
│   │   └── features/         All screens
│   └── pubspec.yaml
│
├── docs/                     Architecture decisions
├── docker-compose.yml        Full stack with Docker
└── SETUP_GUIDE.md            Full Windows setup guide

```

---

## Support

- WhatsApp: +254 781 230 805
- Email: support@zarodasolutions.app
- Website: www.zarodasolutions.app
