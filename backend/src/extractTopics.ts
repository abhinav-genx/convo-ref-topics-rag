import { askClaudeOpus } from "./openrouter.js";

export type Topic = {
  name: string;
  summary: string;
};

const SYSTEM = `You extract topics from a conversation transcript.

What you are doing right now:
- You are only extracting topics. Do not answer questions, chat, or summarize the whole file as prose.
- Each item in the array is one dialogue turn. Turns were split on periods (full stops).
- Name the distinct subjects people actually discussed. Merge repeats. Skip greetings, filler, and one-off asides.

What these topics will be used for later:
- They become the index for a RAG knowledge base (conversation slices + reference documents).
- When a user asks a question, the system will match that question to these topics, then fetch only the matching parts of the knowledge base.
- So each topic must be a stable retrieval key: short, specific, and unambiguous (e.g. "refund policy for annual plans", not "stuff they talked about").
- You are not retrieving anything yet. Later steps will do matching and lookup. Your job is the topic list only.

Return JSON only, no markdown, no extra text:
{"topics":[{"name":"short topic label","summary":"one sentence of what was said about it"}]}`;

function parseTopics(raw: string): Topic[] {
  const trimmed = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("Could not parse topics JSON");
  }

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { topics?: unknown }).topics)
      ? (parsed as { topics: unknown[] }).topics
      : null;

  if (!list) {
    throw new Error("Could not parse topics JSON");
  }

  return list
    .map((item) => {
      if (typeof item === "string") {
        const name = item.trim();
        return name ? { name, summary: "" } : null;
      }
      if (item && typeof item === "object") {
        const rec = item as { name?: unknown; summary?: unknown; topic?: unknown };
        const name = String(rec.name ?? rec.topic ?? "").trim();
        if (!name) return null;
        return { name, summary: String(rec.summary ?? "").trim() };
      }
      return null;
    })
    .filter((t): t is Topic => t !== null);
}

export async function extractTopics(conversation: string[]): Promise<Topic[]> {
  const lines = conversation.map((line) => line.trim()).filter(Boolean);
  if (!lines.length) {
    return [];
  }

  const numbered = lines.map((line, i) => `${i + 1}. ${line}`).join("\n");
  const raw = await askClaudeOpus(
    `Extract RAG topics from this conversation array:\n\n${numbered}`,
    [{ role: "system", content: SYSTEM }],
  );

  return parseTopics(raw);
}
