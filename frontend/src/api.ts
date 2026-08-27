import type { KnowledgeBrowseIndex } from "./types";

const API_BASE = String(import.meta.env.VITE_API_URL || import.meta.env.BACKEND_URL)
  .trim()
  .replace(/\/$/, "");

if (!API_BASE) {
  throw new Error("VITE_API_URL or BACKEND_URL must be set");
}

export type UploadResult = {
  filename: string;
  mimeType: string;
  size: number;
  method: string;
  pages: number;
  kind: "transcript" | "reference";
  text: string;
  charCount: number;
  dialogues?: string[];
  topics?: {
    file_name: string;
    id: string;
    dialogues: string[];
    topics: string[];
    topic_details: Record<string, string>;
  }[];
  topic_store?: {
    file_name: string;
    id: string;
    dialogues: string[];
    topics: string[];
    topic_details: Record<string, string>;
  }[];
  topic_summaries?: Record<string, string>;
  knowledge?: {
    file_name: string;
    knowledge: { topics: Record<string, string[]> }[];
  };
  knowledge_store?: {
    file_name: string;
    knowledge: { topics: Record<string, string[]> }[];
  }[];
};

export type ChatDocument = {
  name: string;
  text: string;
  kind: "transcript" | "reference";
  dialogues?: string[];
  topics?: {
    file_name: string;
    id: string;
    dialogues: string[];
    topics: string[];
    topic_details: Record<string, string>;
  }[];
  knowledge?: {
    file_name: string;
    knowledge: { topics: Record<string, string[]> }[];
  };
};

export async function uploadFile(
  file: File,
  kind: "transcript" | "reference",
): Promise<UploadResult> {
  const body = new FormData();
  body.append("kind", kind);
  body.append("file", file);

  const res = await fetch(`${API_BASE}/api/upload?kind=${encodeURIComponent(kind)}`, {
    method: "POST",
    body,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Upload failed");
  }
  return data as UploadResult;
}

export async function fetchKnowledge(): Promise<KnowledgeBrowseIndex> {
  const res = await fetch(`${API_BASE}/api/knowledge`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to load knowledge");
  }
  return data as KnowledgeBrowseIndex;
}

export async function sendChat(
  conversation: { role: "user" | "assistant"; content: string }[],
  documents: ChatDocument[],
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversation, messages: conversation, documents }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Chat failed");
  }
  return data.reply as string;
}
