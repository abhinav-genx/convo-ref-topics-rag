# Doc Chat

React chat UI + Express/TypeScript API. Upload a PDF or image, extract text with OCR, and ask questions about it.

## Run

```bash
cd backend && npm install && cp .env.example .env
cd ../frontend && npm install
cd .. && npm install && npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001 (CORS allows all origins)

Optional: set `OPENAI_API_KEY` in `backend/.env` for model replies. Without it, chat still works and returns extracted OCR text.

## API

- `POST /api/upload` — multipart field `file` (PDF or image). Returns OCR text.
- `POST /api/chat` — `{ messages, documents }` JSON body.
- `GET /api/health`
