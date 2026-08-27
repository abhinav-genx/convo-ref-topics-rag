import type { IncomingMessage, ServerResponse } from "node:http";

export default function handler(_req: IncomingMessage, res: ServerResponse) {
  const origin = process.env.FRONTEND_URL?.trim().replace(/\/$/, "");
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.end(JSON.stringify({ ok: true }));
}
