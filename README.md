# Doc Chat

React chat UI + Express/TypeScript API. Upload a PDF or image, extract text with OCR, and ask questions about it.

URLs come from env only (`FRONTEND_URL`, `BACKEND_URL`, `VITE_API_URL`). Do not hardcode origins in source.

## Run

```bash
cd backend && npm install && cp .env.example .env
cd ../frontend && npm install
cd .. && npm install && npm run dev
```

Set the repo-root `.env` (Vite reads it at build time):

```
FRONTEND_URL=https://frontend-pink-theta-v6v2fhe4eo.vercel.app
BACKEND_URL=https://backend-eosin-alpha-29.vercel.app
VITE_API_URL=https://backend-eosin-alpha-29.vercel.app
```

Use the same values in the frontend and backend Vercel project env. After changing `VITE_API_URL`, rebuild the frontend.

## Deploy backend (Vercel)

Create a Vercel project whose **Root Directory** is `backend`. Do not run `app.listen` as the start command; Vercel uses `api/health.ts` and `api/[[...path]].ts`.

Set `OPEN_ROUTER_API_KEY`, `BACKEND_URL`, `FRONTEND_URL` (and `OPENROUTER_REFERER` if you want it distinct from `FRONTEND_URL`). After deploy, `GET /api/health` should return `{"ok":true}`.

Scanned-PDF OCR (`canvas` / tesseract) is local-only. On Vercel, text is extracted with pdf.js. Knowledge is in-memory per serverless instance, so it will not persist across cold starts.

## API

- `POST /api/upload` — multipart field `file` (PDF or image). Returns OCR text.
- `POST /api/chat` — `{ messages, documents }` JSON body.
- `GET /api/health`
