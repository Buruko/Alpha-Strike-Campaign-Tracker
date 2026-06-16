# Alpha Strike Campaign Tracker — Cloudflare Deployment

Fully free hosting via **Cloudflare Workers** (API) + **Cloudflare Pages** (frontend) + **D1** (SQLite database).

No credit card required. No cold starts. Always-on.

---

## Free tier limits (more than enough for a campaign group)

| Resource | Free Allowance |
|---|---|
| Workers requests | 100,000 / day |
| D1 reads | 25 million rows / day |
| D1 writes | 100,000 rows / day |
| D1 storage | 5 GB |
| Pages deployments | Unlimited |

---

## One-time setup (do this once)

### 1. Install Wrangler

```bash
npm install -g wrangler
wrangler login        # opens browser to authenticate with your Cloudflare account
```

### 2. Create the D1 database

```bash
cd server
wrangler d1 create campaign-db
```

Copy the `database_id` it prints and paste it into `wrangler.toml`:

```toml
[[d1_databases]]
binding       = "DB"
database_name = "campaign-db"
database_id   = "PASTE_YOUR_ID_HERE"
```

### 3. Run migrations and seed

```bash
# Apply schema
wrangler d1 migrations apply campaign-db --remote

# Seed PSAs and default GM user (gm / changeme)
wrangler d1 execute campaign-db --remote --file=./migrations/0002_seed.sql
```

### 4. Set the JWT secret

```bash
wrangler secret put JWT_SECRET
# Enter a long random string when prompted, e.g.:
# openssl rand -base64 48
```

### 5. Deploy the Worker (API)

```bash
wrangler deploy
```

Note the URL it prints, e.g. `https://alpha-strike-api.YOUR_SUBDOMAIN.workers.dev`

### 6. Deploy the frontend to Cloudflare Pages

```bash
cd ../client
npm install
npm run build

wrangler pages deploy dist --project-name alpha-strike-tracker
```

Note your Pages URL, e.g. `https://alpha-strike-tracker.pages.dev`

### 7. Wire the URLs together

**Set CLIENT_URL on the Worker** (so CORS allows your Pages domain):

```bash
cd ../server
wrangler deploy --var CLIENT_URL:https://alpha-strike-tracker.pages.dev
```

Or add it to `wrangler.toml` permanently:

```toml
[vars]
CLIENT_URL = "https://alpha-strike-tracker.pages.dev"
```

**Set VITE_API_URL on Pages** so the frontend knows where the API is:

In the Cloudflare dashboard → Pages → your project → Settings → Environment variables:

```
VITE_API_URL = https://alpha-strike-api.YOUR_SUBDOMAIN.workers.dev
```

Then redeploy the frontend:

```bash
npm run build
wrangler pages deploy dist --project-name alpha-strike-tracker
```

---

## Local development

### Terminal 1 — Worker (API)

```bash
cd server
npm install

# Apply schema to local D1
wrangler d1 migrations apply campaign-db --local

# Seed local DB
wrangler d1 execute campaign-db --local --file=./migrations/0002_seed.sql

# Start local Worker (listens on :8787)
wrangler dev
```

### Terminal 2 — Frontend

```bash
cd client
npm install
npm run dev    # Vite proxies /api → localhost:8787
```

Open `http://localhost:5173`

---

## Default login

```
Username: gm
Password: changeme
```

**Change the GM password immediately** via Admin → Change Your Password.

---

## Adding more users

Log in as GM → Admin → New User. Set role:

| Role | What they can do |
|---|---|
| **Player** | Manage own pilots, track unit damage, view XP log |
| **Technician** | + Create and complete repair jobs |
| **Quartermaster** | + Unit roster, assign pilots, sell/purchase units, approve repairs, salvage, ledger |
| **GM** | Full access — XP awards, play mode, contracts, admin |

---

## Repair cost formulas (reference)

| Damage type | Cost per pip |
|---|---|
| Armor | `round(PV / 4 / armor_max)` |
| Structure | `round(PV / 2 / armor_max)` |
| Engine hit | `round(PV / 2)` per hit |
| FCU / MP / Weapons | `round(PV / 4)` per hit |

**Sale value** is calculated per pip type using a 7-step formula (Intact Value, Salvage Penalty, Weight Penalty per type), minimum 1 pt.

**Salvage value** = `max(1, base_pv - current_repair_cost)`

---

## Redeploying after changes

```bash
# API changes
cd server && wrangler deploy

# Frontend changes
cd client && npm run build && wrangler pages deploy dist --project-name alpha-strike-tracker

# Schema changes — add a new migration file (0003_whatever.sql) then:
wrangler d1 migrations apply campaign-db --remote
```
