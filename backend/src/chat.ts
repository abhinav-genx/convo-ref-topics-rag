import type { ReferenceKnowledge } from "./extractReference.js";
import { parseModelJson } from "./parseModelJson.js";
import type { TopicBlock } from "./extractTopics.js";
import { askClaudeOpus, type ConversationMessage } from "./openrouter.js";
import {
  retrieveByTopics,
  retrieveReferenceKnowledge,
  uniqueTopicCatalog,
} from "./topicStore.js";

export type ChatMessage = ConversationMessage;

type DocumentContext = {
  name: string;
  text: string;
  kind?: "transcript" | "reference";
  dialogues?: string[];
  topics?: TopicBlock[];
  knowledge?: ReferenceKnowledge;
};

function parseJson(raw: string): unknown {
  return parseModelJson(raw);
}

function pickTopicKeys(raw: string, catalog: Record<string, string>): string[] {
  const parsed = parseJson(raw);
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? (parsed as { topics?: unknown }).topics
      : null;
  if (!Array.isArray(list)) return [];
  const allowed = new Set(Object.keys(catalog));
  const picked: string[] = [];
  for (const item of list) {
    const key = String(item)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!allowed.has(key) || picked.includes(key)) continue;
    picked.push(key);
  }
  return picked;
}

async function selectTopics(
  question: string,
  catalog: Record<string, string>,
): Promise<string[]> {
  const keys = Object.keys(catalog);
  if (!keys.length) return [];

  const raw = await askClaudeOpus(
    `User question:\n${question}\n\nChoose which topic keys to retrieve. Return JSON only: {"topics":["economy","investing"]}`,
    [
      {
        role: "system",
        content: `You only pick topic keys for RAG. Do not answer the question yet.

Each topic name appears once with a running summary. Topics come independently from transcripts and from reference documents; a key may exist in only one source. Pick every key whose name or summary matches the user question. You may pick several. Do not invent keys. Do not skip a reference-only key (for example grievance, effective_intervention, internal_programming) when the question is about that document.

What happens next: the system will load those summaries plus every matching transcript slice AND reference knowledge for those keys.

Unique topic catalog (key → running summary):
${JSON.stringify(catalog)}`,
      },
    ],
  );

  const picked = pickTopicKeys(raw, catalog);
  return picked.length ? picked : keys.slice(0, 3);
}

function retrievedContext(
  blocks: TopicBlock[],
  selected: string[],
  summaries: Record<string, string>,
): string {
  const wanted = new Set(selected);
  const details: Record<string, string> = {};
  const slices = blocks.map((block) => {
    for (const topic of block.topics) {
      if (!wanted.has(topic)) continue;
      const extra = block.topic_details[topic] ?? "";
      if (!details[topic]) details[topic] = extra;
      else if (extra && !details[topic].includes(extra)) {
        details[topic] = `${details[topic]} | ${extra}`;
      }
    }
    return {
      file_name: block.file_name,
      id: block.id,
      topics: block.topics.filter((topic) => wanted.has(topic)),
      dialogues: block.dialogues,
    };
  });

  const topic_summaries: Record<string, string> = {};
  for (const topic of selected) {
    if (summaries[topic]) topic_summaries[topic] = summaries[topic];
  }

  return JSON.stringify({ selected_topics: selected, topic_summaries, topic_details: details, slices });
}

export async function completeChat(
  messages: ChatMessage[],
  documents: DocumentContext[],
  store: TopicBlock[],
  knowledgeStore: ReferenceKnowledge[] = [],
  summaries: Record<string, string> = {},
): Promise<string> {
  const history = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-20);

  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content;
  if (!lastUser) {
    throw new Error("No user prompt to send");
  }

  const blocks = store.length ? store : documents.flatMap((d) => d.topics ?? []);
  const refs =
    knowledgeStore.length
      ? knowledgeStore
      : documents
          .map((d) => d.knowledge)
          .filter((item): item is ReferenceKnowledge => Boolean(item));
  const catalog = uniqueTopicCatalog(blocks, summaries, refs);
  const selected = await selectTopics(lastUser, catalog);
  const retrieved = retrieveByTopics(selected, blocks);
  const referenceHits = retrieveReferenceKnowledge(selected, refs);

  const system = `You answer using retrieved RAG knowledge only.

The user question was matched to unique topic names from transcripts and reference documents (each source can have its own topics). Each name has a running summary. Those names were used to pull matching transcript slices and reference knowledge from the whole database.

Selected topics: ${selected.join(", ") || "(none)"}
Topic summaries:
${JSON.stringify(Object.fromEntries(selected.map((topic) => [topic, summaries[topic] ?? catalog[topic] ?? ""])))}
Retrieved transcript knowledge:
${retrieved.length ? retrievedContext(retrieved, selected, summaries) : "(no transcript slices)"}
Retrieved reference knowledge:
${referenceHits.length ? JSON.stringify(referenceHits) : "(no reference knowledge)"}

Stay inside this retrieved set. If it is not enough, say so.`;

  const prior = history.slice(0, -1);
  return askClaudeOpus(lastUser, [{ role: "system", content: system }, ...prior]);
}
