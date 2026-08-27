import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import { completeChat, type ChatMessage } from "./chat.js";
import { splitDialogues } from "./dialogues.js";
import { extractTopics } from "./extractTopics.js";
import { extractText, isPdfFile } from "./ocr.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env") });
dotenv.config({ path: path.resolve(here, "../.env") });

const PORT = Number(process.env.PORT) || 3001;


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
    cb(null, ok);
  },
});

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Upload a PDF using form field \"file\"." });
      return;
    }

    if (!isPdfFile(file.mimetype, file.originalname)) {
      res.status(400).json({ error: "Only PDF files are allowed." });
      return;
    }

    const result = await extractText(file.buffer);
    const kind = req.body?.kind === "conversation" ? "conversation" : "reference";
    const dialogues = kind === "conversation" ? splitDialogues(result.text) : undefined;
    const topics =
      kind === "conversation" && dialogues ? await extractTopics(dialogues) : undefined;

    res.json({
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      method: result.method,
      pages: result.pages,
      kind,
      text: result.text,
      charCount: result.text.length,
      dialogues,
      topics,
    });
  } catch (err) {
    console.error("Upload/OCR failed:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to extract text from file",
    });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const messages = req.body?.messages as ChatMessage[] | undefined;
    const documents = (req.body?.documents ?? []) as {
      name: string;
      text: string;
      kind?: "conversation" | "reference";
      dialogues?: string[];
    }[];

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "Body must include a non-empty messages array." });
      return;
    }

    const reply = await completeChat(messages, Array.isArray(documents) ? documents : []);
    res.json({ reply });
  } catch (err) {
    console.error("Chat failed:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Chat request failed",
    });
  }
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
