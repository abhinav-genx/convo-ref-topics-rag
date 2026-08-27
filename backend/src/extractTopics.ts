import { randomUUID } from "node:crypto";
import { askClaudeOpus } from "./openrouter.js";
import { parseModelJson } from "./parseModelJson.js";
import { reuseCatalogPrompt, TOPIC_KEY_RULES, topicKey } from "./topicIndex.js";

export const MIN_TOPICS_PER_BLOCK = 9;

export type TopicBlock = {
  file_name: string;
  id: string;
  dialogues: string[];
  topics: string[];
  topic_details: Record<string, string>;
};

export type ExtractedTopics = {
  blocks: TopicBlock[];
  summaries: Record<string, string>;
};

function systemPrompt(existingTopics: string[], summaries: Record<string, string>): string {
  const reuse = reuseCatalogPrompt(existingTopics);

  const summaryBlock = Object.keys(summaries).length
    ? `Current running summary for each existing topic. When you reuse or create a key, UPDATE that summary so it still covers earlier knowledge PLUS anything new in this slice. 2–4 factual sentences. Do not drop older facts.\n${JSON.stringify(summaries)}`
    : "No running summaries yet. For each new topic, topic_summaries starts as a 2–4 sentence overview.";

  return `You extract a compact RAG index from a numbered transcript, in order.

${TOPIC_KEY_RULES}

What you are doing right now:
- Read dialogues from 1 downward. Each line is one turn (split on full stops).
- topics: short lowercase keys, one word or two/three words joined with underscores.
  Examples: "intro", "ice_breaking", "real_estate", "economy", "investing"
- ${reuse}
- Existing keys may have come from transcripts OR reference documents. Independent new transcript topics are expected when the conversation has its own subjects.
- ${summaryBlock}
- topic_details: an object with the SAME keys. Each value is one short sentence about THIS slice only.
  Example: { "economy": "they compared inflation vs wage growth this quarter" }
- topic_summaries: an object with the SAME keys. Each value is the UPDATED running summary for that topic across the whole knowledge base, not just this slice.
- Merge repeats inside this slice. Skip empty greetings unless the topic is intro or ice_breaking.
- Stop as soon as you have ${MIN_TOPICS_PER_BLOCK} topics. Do not keep reading after that.
- "consumed" is the 1-based index of the last dialogue you needed.
  Example: 9 topics from dialogues 1–29 means consumed is 29.

What this will be used for later:
- Stored as { file_name, id, dialogues, topics, topic_details }. Running topic_summaries are stored once per topic name and passed into later extraction and RAG.
- RAG shows each topic name once with its summary. The model picks topic names, then all matching knowledge is loaded from the whole store.

If the remaining lines cannot yield ${MIN_TOPICS_PER_BLOCK} topics, extract what you can and consume all remaining lines.

Return JSON only, no markdown:
{"consumed":29,"topics":["intro","ice_breaking","real_estate","economy","investing"],"topic_details":{"intro":"they introduce names and roles","ice_breaking":"small talk about the commute","real_estate":"buying a rental in austin","economy":"what is discussed on economy","investing":"index funds vs cash"},"topic_summaries":{"intro":"running summary of intro so far","economy":"updated running summary of economy"}}`;
}

function parseJson(raw: string): unknown {
  const parsed = parseModelJson(raw);
  if (parsed == null) {
    throw new Error("Could not parse topics JSON");
  }
  return parsed;
}

function asTopicStrings(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    let label = "";
    if (typeof item === "string") {
      label = item;
    } else if (item && typeof item === "object") {
      const rec = item as { name?: unknown; topic?: unknown };
      label = String(rec.name ?? rec.topic ?? "");
    }
    const key = topicKey(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function asTopicDetails(raw: unknown, topics: string[]): Record<string, string> {
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const details: Record<string, string> = {};
  for (const topic of topics) {
    const direct = src[topic];
    const spaced = src[topic.replaceAll("_", " ")];
    const value = String(direct ?? spaced ?? "").trim();
    details[topic] = value || `what is discussed on ${topic.replaceAll("_", " ")}`;
  }
  return details;
}

function asTopicSummaries(
  raw: unknown,
  topics: string[],
  previous: Record<string, string>,
  details: Record<string, string>,
): Record<string, string> {
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const out: Record<string, string> = {};
  for (const topic of topics) {
    const direct = src[topic];
    const spaced = src[topic.replaceAll("_", " ")];
    const value = String(direct ?? spaced ?? "").trim();
    out[topic] = value || previous[topic] || details[topic];
  }
  return out;
}

async function extractWindow(
  dialogues: string[],
  existingTopics: string[],
  summaries: Record<string, string>,
): Promise<{
  consumed: number;
  topics: string[];
  topic_details: Record<string, string>;
  topic_summaries: Record<string, string>;
}> {
  const numbered = dialogues.map((line, i) => `${i + 1}. ${line}`).join("\n");
  const raw = await askClaudeOpus(
    `Extract ${MIN_TOPICS_PER_BLOCK} underscore topic keys plus topic_details and updated topic_summaries from this slice, then stop.\nReuse an existing key only when the subject matches. New independent keys are expected otherwise.\n\n${numbered}`,
    [{ role: "system", content: systemPrompt(existingTopics, summaries) }],
  );

  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Could not parse topics JSON");
  }

  const rec = parsed as {
    consumed?: unknown;
    topics?: unknown;
    topic_details?: unknown;
    topic_summaries?: unknown;
  };
  const topics = asTopicStrings(rec.topics);
  const topic_details = asTopicDetails(rec.topic_details, topics);
  const topic_summaries = asTopicSummaries(rec.topic_summaries, topics, summaries, topic_details);
  let consumed = Number(rec.consumed);
  if (!Number.isFinite(consumed) || consumed < 1) {
    consumed = dialogues.length;
  }
  consumed = Math.min(Math.max(Math.floor(consumed), 1), dialogues.length);

  return { consumed, topics, topic_details, topic_summaries };
}

export async function extractTopics(
  transcript: string[],
  fileName: string,
  existingTopics: string[] = [],
  existingSummaries: Record<string, string> = {},
): Promise<ExtractedTopics> {
  const lines = transcript.map((line) => line.trim()).filter(Boolean);
  const blocks: TopicBlock[] = [];
  const known = [...existingTopics];
  const summaries = { ...existingSummaries };
  let start = 0;

  while (start < lines.length) {
    const remaining = lines.slice(start);
    const { consumed, topics, topic_details, topic_summaries } = await extractWindow(
      remaining,
      known,
      summaries,
    );
    blocks.push({
      file_name: fileName,
      id: randomUUID(),
      dialogues: remaining.slice(0, consumed),
      topics,
      topic_details,
    });
    for (const topic of topics) {
      if (!known.includes(topic)) known.push(topic);
    }
    Object.assign(summaries, topic_summaries);
    start += consumed;
  }

  return { blocks, summaries };
}
