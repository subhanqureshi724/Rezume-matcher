# RezumeAI — Hackathon Source Bundle

This bundle contains the RezumeAI web app, its Express service, the shared pnpm workspace packages, and the optional Python/Streamlit companion.

## Project structure

- `artifacts/rezumeai/` — React + Vite web app. Resume parsing, role matching, ATS feedback, draft editing, comparison, and DOCX export run in the browser.
- `artifacts/api-server/` — Express service for `/api/healthz` and Clerk's Frontend API proxy. It does not currently expose resume-processing endpoints.
- `artifacts/rezumeai/streamlit/` — optional standalone Python companion app.
- `lib/` — shared API, validation, and database workspace packages.

The web app uses Clerk for sign-in. You need your own Clerk development keys to run its authenticated UI. Do not commit real keys or include them in a public submission.

## Run the web app

Requirements: Node.js 24 and pnpm. From this folder:

```bash
pnpm install
export VITE_CLERK_PUBLISHABLE_KEY="pk_test_your_own_key"
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/rezumeai run dev
```

Open the local URL printed by Vite. The Vite config requires `PORT` and `BASE_PATH` in the process environment. For a deploy build, provide those values and `VITE_CLERK_PUBLISHABLE_KEY`, then run:

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/rezumeai run build
```

## Run the Express service

The service needs its own Clerk keys for authenticated requests and production proxying:

```bash
export CLERK_PUBLISHABLE_KEY="pk_test_your_own_key"
export CLERK_SECRET_KEY="sk_test_your_own_key"
PORT=3001 pnpm --filter @workspace/api-server run dev
```

The API server is not required for local resume analysis or DOCX export. No database is required for those browser-side features.

## Optional Python companion

```bash
cd artifacts/rezumeai/streamlit
python -m pip install -r requirements.txt
python -m streamlit run app.py --server.address 0.0.0.0 --server.port 8501
```

The companion provides a separate Streamlit UI. It may download NLP models on first use; its README documents the matching fallback behavior.
