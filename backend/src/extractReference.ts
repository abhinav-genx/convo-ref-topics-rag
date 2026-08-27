import { askClaudeOpus } from "./openrouter.js";

export const REFERENCE_CHUNK_SIZE = 10_000;

export type KnowledgeChunk = {
  topics: Record<string, string[]>;
};

export type ReferenceKnowledge = {
  file_name: string;
  knowledge: KnowledgeChunk[];
};

function parseJson(raw: string): unknown {
  const trimmed = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error("Could not parse reference knowledge JSON");
  }
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

function asKnowledgeTopics(
  raw: unknown,
  allowed: Set<string>,
): Record<string, string[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const topics: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(src)) {
    const topic = topicKey(key);
    if (!allowed.has(topic)) continue;
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
  const allowed = new Set(existingTopics);
  const raw = await askClaudeOpus(
    `Transcript topics:\n${existingTopics.join(", ")}\n\nCurrent topic summaries:\n${JSON.stringify(summaries)}\n\nReference slice (max ${REFERENCE_CHUNK_SIZE} characters):\n${chunk}`,
    [
      {
        role: "system",
        content: `You scan a reference-document slice for knowledge that matches EXISTING transcript topics.

What you are doing:
- You are given topic keys already extracted from transcripts, plus a running summary of each.
- Read only this slice (about ${REFERENCE_CHUNK_SIZE} characters).
- If the slice has useful facts, procedures, or definitions on those topics, collect them.
- Do not invent new topic names. Do not keep knowledge that is off-topic.
- If you add facts for a topic, also return an UPDATED running summary for that topic (2–4 sentences) that keeps earlier summary content and adds what this slice contributes.

What this is stored as:
{ "file_name": "...", "knowledge": [{ "topics": { "health": ["fact from this file"] } }] }
Running topic_summaries are stored once per topic and passed into later extraction and RAG.

If nothing in this slice matches, return {"topics":{},"topic_summaries":{}}.
Return JSON only:
{"topics":{"health":["all knowledge found on health in this slice"]},"topic_summaries":{"health":"updated running summary"}}`,
      },
    ],
  );

  const parsed = parseJson(raw);
  const rec =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { topics?: unknown; topic_summaries?: unknown })
      : {};
  const topics = asKnowledgeTopics(rec.topics ?? parsed, allowed);
  const summarySrc =
    rec.topic_summaries && typeof rec.topic_summaries === "object" && !Array.isArray(rec.topic_summaries)
      ? (rec.topic_summaries as Record<string, unknown>)
      : {};
  const nextSummaries: Record<string, string> = {};
  for (const topic of Object.keys(topics)) {
    const value = String(summarySrc[topic] ?? summarySrc[topic.replaceAll("_", " ")] ?? "").trim();
    if (value) nextSummaries[topic] = value;
  }
  return { topics, summaries: nextSummaries };
}

export async function extractReferenceKnowledge(
  text: string,
  fileName: string,
  existingTopics: string[],
  existingSummaries: Record<string, string> = {},
): Promise<ReferenceKnowledge & { summaries: Record<string, string> }> {
  if (!existingTopics.length) {
    return { file_name: fileName, knowledge: [], summaries: { ...existingSummaries } };
  }

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
