import { askClaudeOpus } from "./openrouter.js";
import { parseModelJson } from "./parseModelJson.js";

export const REFERENCE_CHUNK_SIZE = 10_000;

export type KnowledgeChunk = {
  topics: Record<string, string[]>;
};

export type ReferenceKnowledge = {
  file_name: string;
  knowledge: KnowledgeChunk[];
};

function parseJson(raw: string): unknown {
  const parsed = parseModelJson(raw);
  if (parsed == null) {
    throw new Error("Could not parse reference knowledge JSON");
  }
  return parsed;
}

function topicKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function chunkText(text: string, size = REFERENCE_CHUNK_SIZE): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + size, text.length);
    if (end < text.length) {
      const slice = text.slice(i, end);
      const breakAt = Math.max(
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf(". "),
        slice.lastIndexOf("\n"),
        slice.lastIndexOf(" "),
      );
      if (breakAt > size * 0.5) {
        end = i + breakAt + 1;
      }
    }
    const piece = text.slice(i, end).trim();
    if (piece) chunks.push(piece);
    i = end;
  }
  return chunks;
}

function asKnowledgeTopics(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const topics: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(src)) {
    const topic = topicKey(key);
    if (!topic) continue;
    const items = Array.isArray(value) ? value : [value];
    const snippets = items
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
    if (snippets.length) topics[topic] = snippets;
  }
  return topics;
}

async function extractChunk(
  chunk: string,
  existingTopics: string[],
  summaries: Record<string, string>,
): Promise<{ topics: Record<string, string[]>; summaries: Record<string, string> }> {
  const reuse = existingTopics.length
    ? `Existing topic keys. Reuse the exact key when the subject is the same (not a synonym):\n${existingTopics.join(", ")}`
    : "No topic keys exist yet. Create short underscore keys for the subjects in this slice.";

  const raw = await askClaudeOpus(
    `${reuse}\n\nCurrent topic summaries:\n${JSON.stringify(summaries)}\n\nReference slice (max ${REFERENCE_CHUNK_SIZE} characters):\n${chunk}`,
    [
      {
        role: "system",
        content: `You index a reference-document slice for RAG.

What you are doing:
- ${reuse}
- If this slice is a distinct subject that is not in the existing keys, CREATE a new short lowercase underscore key.
  Examples: effective_intervention, grievance, internal_programming.
- Do not force unrelated facts onto an existing key. A program catalog is not substance_evaluation. NIC principles are not check_in.
- Extract ALL useful facts in this slice: named programs, numbered lists, deadlines, procedures, definitions. Do not drop an item because it is missing from the existing key list.
- If you add facts for a topic, also return an UPDATED running summary for that topic (2–4 sentences) that keeps earlier summary content and adds what this slice contributes.

What this is stored as:
{ "file_name": "...", "knowledge": [{ "topics": { "health": ["facts from this file"] } }] }
Running topic_summaries are stored once per topic and passed into later extraction and RAG.

If nothing in this slice is useful, return {"topics":{},"topic_summaries":{}}.
Return JSON only:
{"topics":{"internal_programming":["all knowledge found on this topic in this slice"]},"topic_summaries":{"internal_programming":"updated running summary"}}`,
      },
    ],
  );

  const parsed = parseJson(raw);
  const rec =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { topics?: unknown; topic_summaries?: unknown })
      : {};
  const topics = asKnowledgeTopics(rec.topics ?? parsed);
  const summarySrc =
    rec.topic_summaries && typeof rec.topic_summaries === "object" && !Array.isArray(rec.topic_summaries)
      ? (rec.topic_summaries as Record<string, unknown>)
      : {};
  const nextSummaries: Record<string, string> = {};
  for (const topic of Object.keys(topics)) {
    const value = String(summarySrc[topic] ?? summarySrc[topic.replaceAll("_", " ")] ?? "").trim();
    nextSummaries[topic] = value || topics[topic].slice(0, 2).join(" ");
  }
  return { topics, summaries: nextSummaries };
}

export async function extractReferenceKnowledge(
  text: string,
  fileName: string,
  existingTopics: string[],
  existingSummaries: Record<string, string> = {},
): Promise<ReferenceKnowledge & { summaries: Record<string, string> }> {
  const merged: Record<string, string[]> = {};
  const summaries = { ...existingSummaries };
  for (const chunk of chunkText(text)) {
    const { topics, summaries: updates } = await extractChunk(chunk, existingTopics, summaries);
    for (const [topic, snippets] of Object.entries(topics)) {
      if (!merged[topic]) merged[topic] = [];
      for (const snippet of snippets) {
        if (!merged[topic].includes(snippet)) merged[topic].push(snippet);
      }
    }
    Object.assign(summaries, updates);
  }

  return {
    file_name: fileName,
    knowledge: Object.keys(merged).length ? [{ topics: merged }] : [],
    summaries,
  };
}
