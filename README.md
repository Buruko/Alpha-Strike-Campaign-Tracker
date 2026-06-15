# Alpha Strike Campaign Tracker

A full-stack web application for tracking BattleTech Alpha Strike campaigns.

## Features

- **Pilots** — XP tracking, auto rank-up with notification, PSA selection modal
- **Units** — Clickable pip damage tracker + numeric display, repair cost breakdown
- **Repair Queue** — Technician creates jobs, Quartermaster approves, auto accounting debit
- **Unit Roster** — Quartermaster manages all units, pilot assignment, unit sales
- **Play Mode** — GM imports Jeff's Battletech tool JSON, tracks enemy units, logs damage XP, assigns kill credit with disparity-adjusted XP
- **Salvage** — Post-session review of destroyed/captured enemy units, claim to player roster
- **Accounting** — Shared campaign ledger with automated transactions for purchases, sales, repairs, salvage
- **Contracts & Sessions** — GM creates contracts and sessions with objectives and XP rewards
- **Notifications** — In-app bell with rank-up alerts, repair complete, salvage available

## Roles

| Role | Access |
|------|--------|
| Player | Own pilots, own units (damage tracking), XP history |
| Technician | + Create and complete repair jobs |
| Quartermaster | + Unit roster, pilot assignment, unit sales, approve repairs, salvage, ledger |
| GM | Full access — XP awards, play mode, contracts, admin, user management |

---

## Local Development

### 1. Server

```bash
cd server
cp .env.example .env
# Edit .env — set JWT_SECRET to something long and random
npm install
npm run seed        # Creates DB, seeds PSAs, creates default GM user (gm/changeme)
npm run dev         # Starts API on http://localhost:3001
```

### 2. Client

```bash
cd client
npm install
npm run dev         # Starts Vite dev server on http://localhost:5173
```

### Default login

```
Username: gm
Password: changeme
```

**Change the GM password immediately** via Admin → Change Your Password.

---

## Deploy to Render (Free Tier)

1. Push this entire repo to GitHub.
2. Log in to [render.com](https://render.com) and click **New → Blueprint**.
3. Connect your GitHub repo — Render will detect `render.yaml` automatically.
4. Deploy. Two services will be created:
   - `alpha-strike-api` — Express backend (free web service, spins down after 15 min idle)
   - `alpha-strike-tracker` — React frontend (free static site, always on)
5. After deploy, update `CLIENT_URL` in the backend env to match your frontend URL.
6. Open the frontend URL and log in as `gm` / `changeme`.

> **Note:** The free backend tier sleeps after 15 minutes of inactivity. The first request after sleep takes ~30 seconds to wake up. Upgrade to a paid instance ($7/mo) to eliminate cold starts.

---

## Repair Cost Formula

- **Armor** cost per pip: `round(PV / 4 / armor_max)`
- **Structure** cost per pip: `round(PV / 2 / armor_max)`
- **Engine** cost per hit: `round(PV / 2)`
- **FCU / MP / Weapons** cost per hit: `round(PV / 4)`

## Sale Value Formula

Calculated per pip type, then summed:

1. Full repair cost (all pips damaged)
2. Parts total = sum of all max pips
3. Parts % = parts total / full repair cost
4. Per type: Intact Value = pip cost × intact pips
5. Per type: Salvage Penalty = Intact Value × Parts %
6. Per type: Weight Penalty = Intact Value × (10% all types, 50% engine)
7. Per type: Intact Result = Intact Value − (Salvage Penalty + Weight Penalty)
8. Sale Value = max(1, sum(all Intact Results) × Parts %)

## XP System

- **TAC Damage**: 2 XP · **Critical/Melee**: 1 XP
- **Kill XP**: Base value (by unit type/size) × disparity multiplier, rounded
- **Rank progression**: Starting → Rank I (10 XP) → Rank II (25 XP + 1 PSA) → Rank III (40 XP + 2 PSA) → Rank IV (55 XP + 3 PSA)
- Each rank improves pilot skill by 1 (lower = better)
