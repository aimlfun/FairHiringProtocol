# FHP — Local Setup Guide

This gets the API running locally so you can wire the HTML pages to real endpoints.

---

## Prerequisites

### 1. Node.js 20+
Download from https://nodejs.org/en/download — choose the **LTS** Windows installer.

Verify:
```
node --version    # v20.x or v22.x
npm --version
```

### 2. PostgreSQL via Docker
You already have Docker. Run a new container for FHP on port **5433** (avoids clash with your Fintech on 5432):

```bash
docker run --name fhp-postgres \
  -e POSTGRES_PASSWORD=fhp_dev_password \
  -e POSTGRES_DB=fhp \
  -p 5433:5432 \
  -d postgres:16
```

Verify it's running:
```bash
docker ps | grep fhp-postgres
```

---

## First-time database setup

Run the 19 migration files in order against the new container. From the `db/migrations/` folder:

> **Note:** `000_roles.sql` runs first and creates the Postgres roles. The PowerShell/bash loops below pick it up automatically because they sort by filename.

**PowerShell:**
```powershell
Get-ChildItem *.sql | Sort-Object Name | ForEach-Object {
    Write-Host "Running $($_.Name)..."
    Get-Content $_.FullName | docker exec -i fhp-postgres psql -U postgres fhp
}
```

**Git Bash / WSL:**
```bash
for f in $(ls *.sql | sort); do
    echo "Running $f..."
    docker exec -i fhp-postgres psql -U postgres fhp < "$f"
done
```

Expected: you'll see CREATE TABLE, INSERT, etc. for each file. No ERRORs.

---

## API setup

### 1. Create your .env file
Copy `.env.example` to `.env` in the `api/` folder:

```
cp .env.example .env
```

Edit `.env` — two things to change:

**a) Database password** — replace `YOUR_PASSWORD` with `fhp_dev_password` (or whatever you set above):
```
DATABASE_URL=postgresql://postgres:fhp_dev_password@localhost:5433/fhp
IDENTITY_DATABASE_URL=postgresql://postgres:fhp_dev_password@localhost:5433/fhp
FAIRNESS_DATABASE_URL=postgresql://postgres:fhp_dev_password@localhost:5433/fhp
```

**b) JWT secret** — replace the placeholder with a real random string (must be 32+ chars):
```powershell
# Generate one in PowerShell:
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```
Paste the output as your `JWT_SECRET`.

### 2. Install dependencies
```bash
cd api
npm install
```
First run takes ~30 seconds. Subsequent runs are instant (cached).

### 3. Start the API
```bash
npm run dev
```

You should see:
```
[INFO] FHP API listening at http://0.0.0.0:3000
[INFO] Environment: development
[INFO] API docs: http://0.0.0.0:3000/documentation
```

### 4. Verify
Open in your browser:
- **http://localhost:3000/health** — should return `{"status":"healthy",...}`
- **http://localhost:3000/documentation** — Swagger UI with all 62 endpoints

---

## Testing authentication

Register a candidate via Swagger UI or curl:

```bash
curl -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123!",
    "age_confirmed": true,
    "terms_accepted": true
  }'
```

Response includes `access_token`. Use that as `Authorization: Bearer <token>` on subsequent calls.

---

## Keeping the DB across restarts

The Docker container preserves data between `docker stop` / `docker start`. To stop:
```bash
docker stop fhp-postgres
```
To start again:
```bash
docker start fhp-postgres
```

To fully reset (wipe all data and re-migrate):
```bash
docker rm -f fhp-postgres
# then re-run the docker run command and migrations
```

---

## Common issues

| Problem | Fix |
|---------|-----|
| `Cannot connect to database` | Check `docker ps` — is fhp-postgres running? Check port 5433 not 5432 in DATABASE_URL |
| `JWT_SECRET must be at least 32 characters` | Your JWT_SECRET in .env is too short |
| `EADDRINUSE 3000` | Something else is on port 3000 — change `PORT=3001` in .env |
| `npm install` errors about native modules | Run `npm install --ignore-scripts` |
| Role errors in 002_schemas.sql | Run `000_roles.sql` first — the PowerShell loop handles this automatically if you sort by name |
