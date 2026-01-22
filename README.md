Be Better - Local backend (SQLite)

This small demo backend provides user registration/login and stores xp/coins locally using SQLite. It's intended for local development and testing.

Quick start

1. Install dependencies

```bash
# from project root
npm install
```

2. Run migrations (creates data.sqlite)

```bash
npm run migrate
```

3. Start server

```bash
npm start
# server runs on http://localhost:3000
```

API endpoints (demo)

- POST /register
  - body: { username, email?, password }
  - returns: { ok: true, id }
- POST /login
  - body: { username, password }
  - returns: { ok: true, token }
- GET /user
  - requires Authorization: Bearer <token>
  - returns user object with xp and coins
- POST /user/modify
  - requires Authorization: Bearer <token>
  - body: { xpDelta, coinsDelta }
  - increments counters and returns updated user

Notes

- Passwords are hashed with bcrypt.
- Sessions are in-memory tokens (for demo). For production use JWT or a persistent session store.
- This is a minimal POC. For production consider Postgres (Supabase) and proper auth flows.
