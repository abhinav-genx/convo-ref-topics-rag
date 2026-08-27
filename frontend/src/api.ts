const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export type UploadResult = {
  filename: string;
  mimeType: string;
  size: number;
  method: string;
  pages: number;
  kind: "conversation" | "reference";
  text: string;
  charCount: number;
  dialogues?: string[];
  topics?: { name: string; summary: string }[];
};

export type ChatDocument = {
  name: string;
  text: string;
  kind: "conversation" | "reference";
  dialogues?: string[];
};

export async function uploadFile(
  file: File,
  kind: "conversation" | "reference",
): Promise<UploadResult> {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", kind);

  const res = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    body,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Upload failed");
  }
  return data as UploadResult;
}

export async function sendChat(
  messages: { role: "user" | "assistant"; content: string }[],
  documents: ChatDocument[],
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, documents }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Chat failed");
  }
  return data.reply as string;
}
