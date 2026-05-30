# CronWatch - Cron Job Monitoring Platform

A full-stack monitoring platform that tracks scheduled cron jobs across your infrastructure. Detects failures, missed runs, execution delays, and performance regressions — so your team finds out before your users do.

Built by **Priya Yadav**

![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## The Problem

Every backend runs scheduled tasks — database backups, log rotations, email digests, cache refreshes. These jobs run silently in the background. When they fail, there's no popup or notification. Teams discover the failure days later when a customer complains that their data is missing or reports stopped arriving.

CronWatch solves this by giving every cron job a health score, tracking execution history, and alerting immediately when something breaks.

---

## What You Can Monitor

| Cron Job | Schedule | Why It Matters |
|---|---|---|
| Database Backup | `0 2 * * *` (Daily 2 AM) | If this fails silently, a server crash means permanent data loss |
| Log Cleanup | `0 3 * * *` (Daily 3 AM) | Disk fills up → server goes down |
| Health Check | `*/5 * * * *` (Every 5 min) | Detects service outages before users notice |
| Email Digest | `0 8 * * 1-5` (Weekdays 8 AM) | Users stop receiving daily reports |
| Cache Warmup | `*/30 * * * *` (Every 30 min) | Website shows stale data |
| SSL Cert Check | `0 6 * * *` (Daily 6 AM) | Certificate expires → browser shows "Not Secure" |
| Data Sync | `0 */4 * * *` (Every 4 hours) | Staging/test environments fall out of date |
| Invoice Generator | `0 1 1 * *` (Monthly) | Customers don't get billed on time |
| Payment Processing | `0 * * * *` (Hourly) | Payments get stuck, revenue loss |
| Report Generation | `0 9 1 * *` (Monthly) | Management doesn't get monthly metrics |

---

## How to Download and Run

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher
- npm (comes with Node.js)
- Git

### Step 1: Clone the repository

```bash
git clone https://github.com/priyayadav200/cron-job-monitor.git
cd cron-job-monitor
```

### Step 2: Install dependencies

```bash
npm install
```

This installs Express, bcryptjs (password hashing), jsonwebtoken (auth), and cors.

### Step 3: Start the server

```bash
npm start
```

You should see:
```
CronWatch running at http://localhost:3000
```

### Step 4: Open in your browser

Go to `http://localhost:3000` — you'll see the landing page. Click **Start Monitoring** to create your account.

After signup, the dashboard loads with 8 pre-configured demo jobs so you can explore the platform immediately.

---

## How to Set Up Monitoring for Your Cron Jobs

### Step 1: Create a monitor

From the dashboard, click **New Monitor**. Fill in:
- **Name**: What the job does (e.g., "Database Backup")
- **Cron Schedule**: When it runs (e.g., `0 2 * * *` for daily at 2 AM)
- **Environment**: Production or Staging
- **Grace Period**: How many seconds to wait before flagging a missed run

### Step 2: Get your ping URL

Click on any monitor → go to the **Integrate** tab. You'll see a unique ping URL like:

```
https://your-host.com/ping/job_1717123456_abc1
```

### Step 3: Add one line to your cron job script

**Bash / Shell:**
```bash
#!/bin/bash
# Your actual job
pg_dump mydb > /backups/daily_$(date +%Y%m%d).sql

# Ping CronWatch when done
curl -fsS --retry 3 https://your-host.com/ping/YOUR_JOB_ID
```

**With duration tracking:**
```bash
START=$(date +%s)
# ... your job runs here ...
DURATION=$(( $(date +%s) - START ))
curl -fsS "https://your-host.com/ping/YOUR_JOB_ID?duration=$DURATION"
```

**Report a failure:**
```bash
curl -fsS "https://your-host.com/ping/YOUR_JOB_ID?state=fail&msg=backup+failed"
```

**Python:**
```python
import requests, time

PING_URL = "https://your-host.com/ping/YOUR_JOB_ID"

start = time.time()
try:
    # your job logic
    duration = int(time.time() - start)
    requests.get(f"{PING_URL}?duration={duration}")
except Exception as e:
    requests.get(f"{PING_URL}?state=fail&msg={str(e)}")
```

**Node.js:**
```javascript
const https = require("https");
const PING_URL = "https://your-host.com/ping/YOUR_JOB_ID";

const start = Date.now();
try {
  // your job logic
  const dur = Math.round((Date.now() - start) / 1000);
  https.get(`${PING_URL}?duration=${dur}`);
} catch (err) {
  https.get(`${PING_URL}?state=fail&msg=${encodeURIComponent(err.message)}`);
}
```

**Crontab example:**
```bash
# Database backup every day at 2 AM — pings CronWatch on completion
0 2 * * * /usr/local/bin/backup.sh && curl -fsS https://your-host.com/ping/YOUR_JOB_ID
```

### Step 4: Monitor from the dashboard

Once pings start arriving, CronWatch automatically:
- Records every execution with timestamp and duration
- Calculates a health score (0-100)
- Tracks uptime percentage
- Detects failures and creates incidents
- Alerts you when something goes wrong

---

## Dashboard Features

### Monitors View
- List of all your cron jobs with health status (healthy/warning/degraded/critical)
- Filter by status, search by name
- Last 5 run indicators (green = success, red = fail, yellow = delayed)
- Uptime %, average duration, failure count per job

### Monitor Detail (click any job)
- **Overview tab**: Health score, uptime, total runs, MTBF (mean time between failures), MTTR (mean time to recovery), success streak
- **Execution duration chart**: 7-day bar chart showing avg duration per day
- **Daily success/failure chart**: Stacked bars for success vs failure count
- **Duration stats**: Average, minimum, maximum, and P95 execution times
- **Recent runs**: Timestamped list of last 15 executions with status and duration
- **History tab**: All incidents (failures) for this job with severity and resolution status
- **Settings tab**: Edit environment, group, grace period, tags, description
- **Integrate tab**: Copy-paste ping URL and integration code for your scripts

### Incidents View
- All failures across all jobs in one feed
- Filter by open/resolved status
- Shows exit code, error output, severity, and resolution time

### Activity View
- Global timeline of recent executions across all jobs
- Shows job name, status, environment, duration, and time ago

### Integration Page
- Step-by-step setup guide
- Code snippets in cURL, Python, Node.js, and Bash
- Ping URL format and query parameter documentation

### Alerts Configuration
- Notification channels: Email, Slack, Webhook, PagerDuty
- Alert rules: Job failure, missed check-in, duration anomaly, health score drop
- Per-channel toggle controls

---

## How the Health Score Works

Each monitor gets a **0-100 health score** calculated from two factors:

| Factor | Weight | What It Measures |
|---|---|---|
| Overall success rate | 40% | Total successes / total runs across 7 days |
| Recent trend (last 10 runs) | 60% | Success rate of the most recent 10 executions |

The recent trend has higher weight so the score reacts quickly to new failures without overreacting to a single bad run from days ago.

**Score to status mapping:**

| Score | Status | Meaning |
|---|---|---|
| 95-100 | Healthy | Job is running reliably |
| 85-94 | Warning | Minor issues detected |
| 70-84 | Degraded | Frequent failures, needs attention |
| Below 70 | Critical | Job is consistently failing |

---

## API Endpoints

### Auth (public)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/signup` | Create account. Body: `{ name, email, password }` |
| POST | `/api/auth/login` | Login. Returns JWT token valid for 7 days |
| GET | `/api/auth/me` | Check current session (requires token) |

### Monitoring (requires JWT)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/dashboard` | Overview metrics: health, uptime, runs, failures, incidents |
| GET | `/api/jobs` | List all monitors with analytics. Filters: `?env=`, `?status=` |
| GET | `/api/jobs/:id` | Full detail for one monitor with history, charts, incidents |
| POST | `/api/jobs` | Create monitor. Body: `{ name, schedule, environment, group, ... }` |
| PUT | `/api/jobs/:id` | Update monitor settings |
| DELETE | `/api/jobs/:id` | Delete a monitor |
| GET | `/api/timeline` | Recent executions across all jobs. `?limit=N` |
| GET | `/api/incidents` | All incidents. Filter: `?status=open` or `?status=resolved` |

### Ping (public — called by your cron jobs)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/ping/:jobId` | Record a heartbeat. Query: `?state=`, `?duration=`, `?msg=` |
| POST | `/ping/:jobId` | Same, accepts JSON body |

---

## Tech Stack & Why Each Choice

| Technology | Why |
|---|---|
| **Node.js + Express** | Lightweight HTTP server. Handles auth, CRUD, analytics, and ping endpoints with minimal overhead. No framework bloat. |
| **bcryptjs** | Industry-standard password hashing. Passwords are salted and hashed with 10 rounds before storage. Even if the data file leaks, passwords can't be recovered. |
| **jsonwebtoken (JWT)** | Stateless authentication. The server doesn't track sessions — each request carries a signed token. Scales horizontally without shared session stores. |
| **JSON file storage** | Zero-dependency persistence. No database setup needed for development. In production, this would be swapped for PostgreSQL or MongoDB. |
| **Canvas API** | Native browser charts without any charting library. Duration and daily stats are rendered as bar charts using HTML5 Canvas — keeps the bundle size at zero. |
| **Seeded RNG (Mulberry32)** | Deterministic random number generator for demo data. Same job ID always produces the same execution history, so the dashboard feels consistent across page reloads. |
| **Vanilla JS** | No React, no Vue, no build step. The entire frontend is plain HTML/CSS/JS served as static files. Fast to load, nothing to compile. |

---

## Project Structure

```
cron-job-monitor/
├── server.js              # Express server: auth, CRUD, ping endpoint,
│                          # simulation engine, analytics, REST API
├── public/
│   ├── index.html         # Landing page (public)
│   ├── login.html         # Login page
│   ├── signup.html        # Signup page
│   ├── dashboard.html     # Protected dashboard (sidebar, monitors,
│   │                      # incidents, timeline, integrations, alerts)
│   ├── style.css          # Landing page styles
│   ├── dashboard.css      # Dashboard styles (sidebar layout, detail panel,
│   │                      # charts, modals, responsive breakpoints)
│   ├── auth.css           # Login/signup page styles
│   └── app.js             # Landing page JS (navbar scroll, smooth scroll)
├── data.json              # Auto-created. Stores users + jobs (gitignored)
├── package.json
├── .gitignore
└── README.md
```

---

## Security

- **Passwords hashed with bcrypt** (10 salt rounds) — even if `data.json` is exposed, passwords can't be reversed
- **JWT with 7-day expiry** — balances security with convenience
- **Auth middleware on all dashboard routes** — no data returned without a valid token
- **User isolation** — each user only sees their own jobs. User A cannot access User B's monitors

---

## License

MIT
