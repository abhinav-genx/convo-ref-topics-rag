import { askClaudeOpus } from "./openrouter.js";
import { parseModelJson } from "./parseModelJson.js";
import { reuseCatalogPrompt, TOPIC_KEY_RULES, topicKey } from "./topicIndex.js";

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
  const reuse = reuseCatalogPrompt(existingTopics);
  const summaryBlock = Object.keys(summaries).length
    ? `Current running summaries. When you reuse or create a key, return a 2–4 sentence summary that keeps earlier facts and adds what this slice contributes.\n${JSON.stringify(summaries)}`
    : "No running summaries yet. topic_summaries starts as a 2–4 sentence overview of each new key.";

  const raw = await askClaudeOpus(
    `${reuse}\n\n${summaryBlock}\n\nReference slice (max ${REFERENCE_CHUNK_SIZE} characters):\n${chunk}`,
    [
      {
        role: "system",
        content: `You index a reference document for RAG. This document is a first-class topic source, equal to transcripts.

${TOPIC_KEY_RULES}

What you are doing:
- Read only this slice.
- Extract EVERY distinct subject in the slice as its own topic key, even if no transcript has that topic.
- Named programs, numbered lists, deadlines, procedures, and definitions each belong under the topic they are about. Keep all of them.
- If this slice is a program catalog, use a key such as internal_programming and list every program (T4G, MRT, Thinking for Good, etc.).
- If this slice is a policy that transcripts never mentioned, still create keys (grievance, appeal, effective_intervention, …).

What this is stored as:
{ "file_name": "...", "knowledge": [{ "topics": { "grievance": ["facts from this file"] } }] }
Running topic_summaries are stored once per topic and used later for RAG.

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
  const known = [...existingTopics];
  const merged: Record<string, string[]> = {};
  const summaries = { ...existingSummaries };
  for (const chunk of chunkText(text)) {
    const { topics, summaries: updates } = await extractChunk(chunk, known, summaries);
    for (const [topic, snippets] of Object.entries(topics)) {
      if (!merged[topic]) merged[topic] = [];
      if (!known.includes(topic)) known.push(topic);
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
