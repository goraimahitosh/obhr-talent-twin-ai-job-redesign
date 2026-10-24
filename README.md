# TALENT TWIN — Job Redesign Lab (v2.2, multi-user web app)

A classroom simulation for **Strategic HRM: job analysis, competency mapping and AI-era job redesign**.
Students redesign a Customer Support Executive role for AI, test the business case, plan the workforce
and reskilling, and defend their recommendation with case evidence. Faculty see every participant live,
rank and score them automatically, control the timer, share protected documents, and bring in analysis
from the **LEAH TALENT TWIN orchestrator**.

| Who | URL | Login |
|---|---|---|
| Students | `https://<your-site>.netlify.app/` | None. They type their name. |
| Faculty | `https://<your-site>.netlify.app/admin.html` | Faculty password (you create it on first visit) |

**Stack:** a static site plus one serverless function on **Netlify**. Data and documents are stored in **Netlify Blobs**,
and the free AI runs on **Netlify AI Gateway**. Both are built into Netlify.
**There is no database to create, no API keys to copy and no environment variables to set.**

---

## Deploy (≈3 minutes)

### Option A — Netlify CLI (recommended; always deploys the serverless function)
Needs Node.js 18+ on your computer. Run from inside the unzipped `talent-twin` folder:
```bash
npx netlify-cli login            # opens the browser once; click Authorize
npx netlify-cli deploy --prod    # first time: choose "Create & configure a new project"
```
To update an existing site later, run `npx netlify-cli link` once, then `npx netlify-cli deploy --prod`.

### Option B — GitHub + Netlify
Push this folder to a GitHub repo → Netlify → **Add new project → Import an existing project** → pick the repo.
Settings are read from `netlify.toml`.

### Option C — Drag and drop
Netlify → **Deploys** → drag the **unzipped folder** in. Then open `https://<site>/api/health`.
If it does **not** show `{"ok":true,…}`, your drag-and-drop deploy skipped the server function; use Option A or B.

## First run (do this immediately after deploying)
1. Open `https://<your-site>.netlify.app/admin.html`.
2. You'll see **Create the faculty password**. Choose one with 10+ characters and enter it twice.
   The first person to open the console sets it, so do this before sharing any links.
3. Open the student link in a private window, play a test run, submit, then delete the test entry from its drawer in the console.

**Forgot the password?** In Netlify → Project configuration → Environment variables, add `ADMIN_PASSWORD` with a new value and redeploy.
That variable always overrides the stored password.

---

## What faculty can do (`/admin.html`)
- **Dashboard & rankings**: live list of every participant (name, roll, anonymous code), progress and time left,
  automatic score with the 5 rubric categories, rank, duplicate-name flags, category averages, and how the class allocated each task.
  Click a row for the full report; add a ±10 adjustment with a reason, reopen, submit on their behalf, or delete. Export CSV.
- **Session & timer**: open/close entry, per-participant time limit (minutes), optional fixed end time,
  "End session now" (auto-submits everyone's saved work), rounds/sections, case facts, what participants see after submitting
  (score, rank, debrief release), and changing the faculty password.
- **Documents**: upload PDF, images, Word (.docx), Excel (.xlsx), CSV or text (≤50 MB). Participants view them in a protected viewer
  with no download link, a name watermark and blocked save/print/copy shortcuts. Files are served only to signed-in participants,
  in 3 MB pieces through the app.
  *Honest limit:* no website can stop screenshots or a determined user with developer tools. This stops casual downloading and makes leaks traceable.
  Convert PowerPoint to PDF before uploading.
- **LEAH orchestrator**: see below.
- **Scoring guide**: the full rubric and the faculty reference pattern.

## Free AI: coach chatbot + AI suggestions in the report
- **AI coach**: an "Ask the AI coach" button for participants. It explains concepts (capacity vs cash, payback, Hackman & Oldham),
  case facts and evidence cards, and checks arithmetic. It is instructed never to reveal which option scores best and sees the student's current choices.
  Default limit: 10 AI replies per participant, set in the console. Faculty can read every conversation in the participant drawer.
- **AI suggestions**: 3–4 personalised suggestions, a "replay" idea and a reflection question at the top of each final report, generated once per participant.
  It does not reveal reference answers until you release the debrief, and never changes the score.
- **How it's free**: Netlify AI Gateway gives functions access to OpenAI models with no key (Netlify injects the credentials).
  Usage is paid from your Netlify plan's monthly credits. The default model, `gpt-4.1-nano`, costs about 0.07 credits per coach reply and 0.1 per report,
  so roughly **45 credits for a 60-student class**.
- **Important**: the Free plan has **300 credits per month** shared with hosting (each production deploy costs 15). **If credits run out, Netlify pauses the
  whole site until next month.** The console therefore has a **monthly AI credit cap** (default 100), an on/off switch, and a live usage meter.
  When AI is off, capped or unavailable, a built-in rule-based coach answers instead, so the simulation never depends on AI.
- **Turning it on**: it works automatically after the first production deploy on a credit-based plan (Free, Personal or Pro), provided AI features are enabled
  for your team (Netlify → Team settings → AI features). Check with **Console → Session & timer → Free AI → Test AI**.
- **Privacy**: prompts contain the case, the participant's choices and rationale, and their questions. **No names** are sent. Netlify routes only to providers with zero data retention.

## LEAH integration (faculty bridge)
LEAH (iimv.agentic.leahai.com) does not offer API keys for calling an orchestrator from another website, so the app uses a
**faculty bridge**. Students never need LEAH accounts.
1. In LEAH Studio the orchestrator **TALENT TWIN – AI Job Redesign Orchestrator** has been created (Draft).
   Review it, then **Publish** when you are happy. Build spec: `docs/LEAH_ORCHESTRATOR_BUILD_PROMPT.txt`.
2. Console → **LEAH orchestrator** tab → **Step A**: copy the case prompt → open the orchestrator (Preview) → paste → send →
   copy LEAH's whole answer → paste back → **Import**. Participants see LEAH's task-by-task recommendation next to theirs once you release the debrief.
3. **Step B** after submissions: copy the class-debrief prompt (anonymous codes only, never names, 12 per batch) → run in LEAH → paste back → **Import**.
   Each participant's report shows LEAH's personal feedback; class insights appear when the debrief is released.

## Files
```
public/                      index.html (students) · admin.html (faculty) · css/ · js/ · vendor/ (PDF.js, Mammoth, SheetJS)
netlify/functions/api.mjs    the server function, pre-built (includes the Netlify Blobs and OpenAI clients), so no npm install is needed
src/api/                     server source: index.mjs (routes) · scoring.mjs (server-only rubric & reference) · store.mjs (Netlify Blobs) · ai.mjs (AI coach & suggestions) · auth.mjs
scripts/build.mjs            rebuilds netlify/functions/api.mjs from src/api (only if you edit server code: npm install && npm run build)
docs/                        FACULTY_GUIDE.md · LEAH_ORCHESTRATOR_BUILD_PROMPT.txt
```

## Data & security notes
- Everything is stored in this site's Netlify Blobs stores (`tt-data`, `tt-files`). It persists across redeploys and is
  visible to you in Netlify → **Blobs**. Deleting the Netlify project deletes the data. Export CSV after each class.
- Scores are computed on the server from decisions. The browser cannot submit a score, and reference answers are never sent to participants before release.
- Participant sessions use random tokens (only a hash is stored). The faculty password is stored as a salted scrypt hash.
  Faculty sessions are signed and expire after 12 hours; changing the password signs everyone out.
- No login means anyone with the link can join under any name. Duplicate names are flagged, and faculty can delete entries.
- Designed for a class (tested with 40 simultaneous participants). The faculty dashboard refreshes every 10 seconds.
