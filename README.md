# RGB Sprint Planner

Sprint planning app for team RGB (Niv, Omer, Dana). Manages a monthly backlog (20-day cycles) and weekly sprints (5-day sprints).

## Setup

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Deploy to Railway

1. Create a GitHub repo and push the code
2. Connect to Railway
3. Add a persistent volume with mount path `/app/data`
4. Start command: `npm start`
5. Railway auto-detects Node.js

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/state` | Get current state |
| POST | `/api/state` | Save state |
| POST | `/api/state/reset` | Reset to seed data |
