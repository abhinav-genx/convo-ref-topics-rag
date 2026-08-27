# Doc Chat

Chat over supervision transcripts and reference PDFs. Topics are indexed into an in-memory RAG store, then used to answer questions.

## Run locally

You need Node 20+ and an [OpenRouter](https://openrouter.ai/) API key.

```bash
cd backend && npm install
cd ../frontend && npm install
cd .. && npm install
cp .env.example .env
```

Put this in the repo-root `.env` (Vite and the API both read it):

```
OPEN_ROUTER_API_KEY=sk-or-v1-...
BACKEND_URL=http://localhost:3001
VITE_API_URL=http://localhost:3001
FRONTEND_URL=http://localhost:5173
PORT=3001
OPENROUTER_REFERER=http://localhost:5173
OPENROUTER_TITLE=Doc Chat
```

Then start both apps:

```bash
npm run dev
```

- UI: http://localhost:5173
- API: http://localhost:3001

In the UI, mark each PDF as **transcript** or **reference**, upload it, then ask questions in Chat. Knowledge shows the topic index.

Restarting the API clears the store (it lives in memory only).

## How RAG works

Two document kinds feed one shared topic index.

**Transcripts.** PDF text is split on periods into dialogue turns. The model walks the transcript in order and emits short underscore topic keys (`check_in`, `fees_payment`, …) in windows of at least nine topics, plus a one-line detail for that slice. Re-uploading the same filename replaces that file’s blocks.

**Reference documents.** PDF text is scanned in ~10,000-character slices. The model pulls facts, procedures, and lists into `{ topic → snippets }`.

**Independent topics.** Transcripts and reference PDFs each mint their own keys. They share a key only when the subject is the same (reuse `drug_screen`, do not invent `ua_testing`). A grievance policy or program catalog can exist in the index even if no transcript mentioned it.

**Running summaries.** Each topic has one 2–4 sentence summary that is updated whenever that key is reused. Chat never sees the full store at once; it sees this catalog first.

**Retrieve, then answer.** On a question the model only picks topic keys from the catalog (key → summary). The API then loads every matching transcript slice and every matching reference snippet. A second call answers from that retrieved set only and says so if it is not enough.
