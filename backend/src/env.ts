import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseOriginList } from "./corsOrigins.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env") });
dotenv.config({ path: path.resolve(here, "../.env") });

function requiredUrl(name: string): string {
  const raw = parseOriginList(process.env[name])[0];
  if (!raw) {
    throw new Error(`${name} must be set`);
  }
  return raw;
}

export const BACKEND_URL = requiredUrl("BACKEND_URL");
export const FRONTEND_URL = requiredUrl("FRONTEND_URL");
