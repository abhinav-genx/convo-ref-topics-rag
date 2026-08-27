import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import { completeChat, type ChatMessage } from "./chat.js";
import { splitDialogues } from "./dialogues.js";
import { extractReferenceKnowledge } from "./extractReference.js";
import { extractTopics, type TopicBlock } from "./extractTopics.js";
import { extractText, isPdfFile } from "./ocr.js";
import {
  getKnowledgeStore,
  getTopicStore,
  getTopicSummaries,
  knowledgeBrowseIndex,
  knownTopicNames,
  mergeTopicSummaries,
  topicSummariesExcept,
  upsertFileKnowledge,
  upsertFileTopics,
} from "./topicStore.js";

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

function readKind(req: express.Request): "transcript" | "reference" {
  const raw = req.body?.kind ?? req.query?.kind ?? "";
  const value = Array.isArray(raw) ? raw[0] : raw;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "transcript" || normalized === "conversation"
    ? "transcript"
    : "reference";
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/knowledge", (_req, res) => {
  res.json(knowledgeBrowseIndex());
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
    const kind = readKind(req);
    const dialogues = kind === "transcript" ? splitDialogues(result.text) : undefined;
    const extracted =
      kind === "transcript"
        ? await extractTopics(
            dialogues ?? [],
            file.originalname,
            knownTopicNames(file.originalname),
            topicSummariesExcept(file.originalname),
          )
        : undefined;
    const topics = extracted?.blocks;

    const topic_store =
      kind === "transcript" && topics
        ? upsertFileTopics(file.originalname, topics)
        : undefined;

    const topic_summaries =
      kind === "transcript" && extracted
        ? mergeTopicSummaries(extracted.summaries)
        : undefined;

    const knowledge =
      kind === "reference"
        ? await extractReferenceKnowledge(
            result.text,
            file.originalname,
            knownTopicNames(),
            getTopicSummaries(),
          )
        : undefined;

    const knowledge_store =
      kind === "reference" && knowledge
        ? upsertFileKnowledge({
            file_name: knowledge.file_name,
            knowledge: knowledge.knowledge,
          })
        : undefined;

    if (kind === "reference" && knowledge) {
      mergeTopicSummaries(knowledge.summaries);
    }

    if (kind === "transcript") {
      console.log(JSON.stringify({ topic_store: topic_store ?? getTopicStore(), topic_summaries: getTopicSummaries() }, null, 2));
    } else {
      console.log(JSON.stringify({ knowledge_store: knowledge_store ?? getKnowledgeStore(), topic_summaries: getTopicSummaries() }, null, 2));
    }

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
      topic_store,
      topic_summaries: getTopicSummaries(),
      knowledge,
      knowledge_store,
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
      kind?: "transcript" | "reference";
      dialogues?: string[];
      topics?: TopicBlock[];
      knowledge?: {
        file_name: string;
        knowledge: { topics: Record<string, string[]> }[];
      };
    }[];

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "Body must include a non-empty messages array." });
      return;
    }

    const reply = await completeChat(
      messages,
      Array.isArray(documents) ? documents : [],
      getTopicStore(),
      getKnowledgeStore(),
      getTopicSummaries(),
    );
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
