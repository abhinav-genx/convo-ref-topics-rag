import type { IncomingMessage, ServerResponse } from "node:http";
import { isAllowedOrigin } from "../src/corsOrigins.js";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.end(JSON.stringify({ ok: true }));
}
