# Company Radar

A full-stack company research tool for software engineers evaluating potential employers. Enter a company name and your profile — get a structured intelligence report with green flags, red flags, and a verdict.

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router, TypeScript) — Vercel (free) |
| Backend | Python FastAPI + LangGraph — Render Web Service (free) |
| LLM | Groq API (`llama-3.3-70b-versatile`) |
| Embeddings | fastembed (`BAAI/bge-small-en-v1.5`, runs inside the backend process) |
| Web Search | SearXNG — Android phone (Termux) exposed via Serveo SSH tunnel |
| Web Scraping | httpx (async HTTP, no browser) |
| Vector Store | ChromaDB (embedded, persists to `./chroma_data`) |

> **Why run SearXNG on a phone?** Cloud providers (Render, AWS, GCP) are blocked by Google, Bing, and DuckDuckGo. Running SearXNG on a home network bypasses this — a residential IP returns real search results. The phone stays on and the tunnel keeps the URL stable.

## How It Works

1. You enter a **company name** and your **profile** (experience, target role, priorities, reason for leaving)
2. The **Planner** generates 11 targeted search queries (site-specific: Glassdoor, AmbitionBox, Reddit, TeamBlind, Levels.fyi, Naukri, etc.)
3. The **Search & Embed** node runs queries via SearXNG (on your phone), scrapes pages with httpx, chunks and embeds text with fastembed, and stores results in ChromaDB
4. The **Synthesizer** retrieves the top 20 most relevant chunks via cosine similarity and generates a structured report using Groq
5. If research gaps are detected, the loop runs up to 3 iterations with gap-filling queries
6. The final report streams to the browser with:
   - Company vitals (size, funding, ratings, salaries, remote policy)
   - Green flags with inline citations
   - Red flags with inline citations
   - Verdict: **PURSUE / CAUTION / AVOID**
   - Non-obvious insights

---

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 18+
- Groq API key — https://console.groq.com

### 1. Start SearXNG

SearXNG runs as a plain Python process — no Docker needed.

```bash
bash searxng/start.sh
```

On first run this clones the SearXNG repo to `/tmp/searxng-local` and installs its dependencies (~2 min). Subsequent runs start instantly. SearXNG will be available at `http://localhost:8080`.

> **Note:** `pip install` of SearXNG fails due to a bug in its `setup.py` (imports `msgspec` before it's installed). The script works around this by cloning the repo and running directly via `PYTHONPATH`.

### 2. Configure environment

```bash
cd backend
cp .env.example .env   # add your GROQ_API_KEY

cd ../frontend
cp .env.example .env   # defaults work for local dev
```

### 3. Install Python dependencies

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

The fastembed model (`BAAI/bge-small-en-v1.5`, ~45 MB) downloads automatically on first run.

### 4. Start the backend

```bash
cd backend
source .venv/bin/activate
uvicorn main:server --port 8000 --reload
```

### 5. Install and start the frontend

```bash
cd frontend
npm install
npm run dev
```

### 6. Open http://localhost:3000

---

## SearXNG on Android (Termux)

This is required for production — cloud IPs are blocked by search engines, so SearXNG must run on a home network. These steps set up SearXNG on an Android phone and expose it via a stable HTTPS tunnel.

### Prerequisites

- Android phone on a home Wi-Fi network
- [Termux](https://f-droid.org/packages/com.termux/) installed from F-Droid (not Play Store — the Play Store version is outdated)
- [Serveo](https://console.serveo.net) account (free)

---

### Step 1 — Install dependencies in Termux

```bash
pkg update && pkg upgrade -y
pkg install python git openssh
```

---

### Step 2 — Clone and install SearXNG

```bash
git clone --depth 1 https://github.com/searxng/searxng ~/searxng-src
pip install -r ~/searxng-src/requirements.txt
```

> **Why clone instead of `pip install`?** SearXNG's `setup.py` imports `msgspec` before it's installed, causing `pip install git+...` to fail. Cloning and installing `requirements.txt` directly works around this.

---

### Step 3 — Create SearXNG config

```bash
mkdir -p ~/searxng-config
cat > ~/searxng-config/settings.yml << 'EOF'
use_default_settings: true
server:
  secret_key: "phone-local-secret"
  bind_address: "127.0.0.1"
  port: 8080
  limiter: false
search:
  formats:
    - html
    - json
EOF
```

---

### Step 4 — Generate an SSH key

This key locks your Serveo subdomain to your phone. The same key always gets the same URL.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""
```

Copy the public key — you'll need it for Serveo:

```bash
cat ~/.ssh/id_ed25519.pub
```

---

### Step 5 — Register your domain on Serveo

1. Go to [console.serveo.net](https://console.serveo.net)
2. Sign in (free account)
3. Go to **SSH Keys** → paste your public key from the step above → Save
4. Go to **Domains** → **Add Domain** → enter a subdomain like `searxng-yourname` → Save

Your permanent tunnel URL will be `https://searxng-yourname.serveousercontent.com`.

---

### Step 6 — Create the start script

```bash
cat > ~/start-searxng.sh << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
PYTHONPATH=~/searxng-src \
SEARXNG_SETTINGS_PATH=~/searxng-config/settings.yml \
  python -m searx.webapp &

sleep 3

ssh -o StrictHostKeyChecking=no \
    -o ServerAliveInterval=30 \
    -R searxng-yourname.serveousercontent.com:80:localhost:8080 \
    serveo.net
EOF
chmod +x ~/start-searxng.sh
```

Replace `searxng-yourname` with your actual registered subdomain.

---

### Step 7 — Run it

```bash
termux-wake-lock && ~/start-searxng.sh
```

`termux-wake-lock` prevents Android from killing the process when the screen locks.

You should see SearXNG start on port 8080, followed by the SSH tunnel connecting. The terminal will stay open — minimize Termux, do not close it.

---

### Step 8 — Verify

From any other device or your laptop:

```bash
curl "https://searxng-yourname.serveousercontent.com/search?q=test&format=json"
```

You should get a JSON response with search results. The Serveo browser warning page only appears in browsers — API calls bypass it automatically.

---

### Keeping it running

- Always use `termux-wake-lock` before starting — without it Android will kill Termux when the screen times out
- Keep the phone plugged in
- If the tunnel drops, just run `termux-wake-lock && ~/start-searxng.sh` again — the URL stays the same
- The app will not work if your phone is off, on mobile data instead of Wi-Fi, or if Termux is closed

---

## Deployment

Production architecture:

```
Android Phone (home Wi-Fi)
  └── SearXNG :8080 ──SSH tunnel──▶ searxng-yourname.serveousercontent.com
                                              │
GitHub (main branch)                          │
  │                                           │
  ├── GitHub Actions (CI/CD)                  │
  │     ├── check-backend  (syntax check)     │
  │     ├── check-frontend (tsc --noEmit)     │
  │     └── deploy (triggers Render hook)     │
  │                                           ▼
  ├── Render ── company-radar-backend ────────▶ calls Serveo tunnel for searches
  └── Vercel ── company-radar-frontend (auto-deploys on push)
```

### First Deployment — Step by Step

#### Step 1 — Accounts you need

- [Render](https://render.com) account
- [Vercel](https://vercel.com) account
- [Serveo](https://console.serveo.net) account (for the Android tunnel — set up first)

---

#### Step 2 — Set up SearXNG on your phone

Follow the **SearXNG on Android (Termux)** section above. Once the tunnel is running and `curl` returns JSON, note your tunnel URL:

```
https://searxng-yourname.serveousercontent.com
```

---

#### Step 3 — Deploy backend to Render

Go to **render.com → New → Web Service**, connect your GitHub repo.

- Set **Language** to `Python`
- Set **Root Directory** to `backend`
- Set **Build Command** to:
  ```
  pip install -r requirements.txt
  ```
- Set **Start Command** to:
  ```
  uvicorn main:server --host 0.0.0.0 --port $PORT
  ```

Set environment variables:

| Variable | Value |
|----------|-------|
| `GROQ_API_KEY` | Your key from console.groq.com |
| `SEARXNG_URL` | `https://searxng-yourname.serveousercontent.com/search` |
| `ALLOWED_ORIGINS` | `https://placeholder.vercel.app` (update after step 4) |

Save and wait for **Live**.

---

#### Step 4 — Deploy frontend to Vercel

Go to **vercel.com → New Project → Import Git Repository**. Select your repo.

- Set **Root Directory** to `frontend`
- Add environment variable: `BACKEND_URL` = `https://your-backend.onrender.com`
- Click **Deploy**

Once deployed, copy your Vercel URL (e.g. `https://company-radar-xyz.vercel.app`).

---

#### Step 5 — Update backend CORS with real Vercel URL

Go to **Render → your backend service → Environment**.

Update `ALLOWED_ORIGINS` from the placeholder to your actual Vercel URL. Render redeploys automatically.

---

#### Step 6 — Wire up CI/CD (GitHub Actions)

Get the deploy hook from Render:
- **Render → your backend → Settings → Deploy Hook** → copy URL

Add as a GitHub secret — **repo → Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|--------|-------|
| `RENDER_BACKEND_DEPLOY_HOOK` | Backend deploy hook URL |

From now on, every push to `main` runs checks → deploys the backend if they pass. Vercel deploys the frontend independently in parallel.

---

## Environment Variables

### Backend (set in Render Dashboard)

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | Groq API key for LLM inference |
| `SEARXNG_URL` | Yes | SearXNG search endpoint (your Serveo tunnel URL + `/search`) |
| `ALLOWED_ORIGINS` | Yes | Comma-separated allowed CORS origins (your Vercel URL) |

### Frontend (set in Vercel Dashboard)

| Variable | Required | Description |
|----------|----------|-------------|
| `BACKEND_URL` | Yes | Backend base URL (your Render service URL) |

---

## Notes

- Each research session creates a fresh ChromaDB collection; old collections are cleaned up after 7 days
- SearXNG must be running on your phone and the Serveo tunnel must be active for the app to work
- The full research process takes 2–5 minutes depending on network speed and number of iterations
- fastembed runs inside the backend process — no separate embedding service needed
- SearXNG's `pip install git+...` fails due to a `setup.py` bug — both the phone setup and `searxng/start.sh` work around this by cloning and installing `requirements.txt` directly
- The Serveo browser warning page does not affect API calls — only browser visits trigger it
- Web scraping uses httpx (pure HTTP, no browser) — faster, lower memory, and no Chrome crashes on cloud free tiers; JavaScript-rendered content is not needed since review sites serve enough content in their initial HTML
