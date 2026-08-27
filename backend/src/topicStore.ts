import type { ReferenceKnowledge } from "./extractReference.js";
import type { TopicBlock } from "./extractTopics.js";

let topicStore: TopicBlock[] = [];
let knowledgeStore: ReferenceKnowledge[] = [];
let topicSummaries: Record<string, string> = {};

export function getTopicStore(): TopicBlock[] {
  return topicStore;
}

export function getTopicSummaries(): Record<string, string> {
  return topicSummaries;
}

export function topicSummariesExcept(fileName?: string): Record<string, string> {
  if (!fileName) return { ...topicSummaries };
  const kept = new Set<string>();
  for (const block of topicStore) {
    if (block.file_name === fileName) continue;
    for (const topic of block.topics) kept.add(topic);
  }
  const out: Record<string, string> = {};
  for (const topic of kept) {
    if (topicSummaries[topic]) out[topic] = topicSummaries[topic];
  }
  return out;
}

function pruneTopicSummaries() {
  const live = new Set(knownTopicNames());
  for (const file of knowledgeStore) {
    for (const chunk of file.knowledge) {
      for (const topic of Object.keys(chunk.topics)) live.add(topic);
    }
  }
  topicSummaries = Object.fromEntries(
    Object.entries(topicSummaries).filter(([topic]) => live.has(topic)),
  );
}

export function mergeTopicSummaries(updates: Record<string, string>): Record<string, string> {
  for (const [topic, summary] of Object.entries(updates)) {
    const text = summary.trim();
    if (!topic || !text) continue;
    topicSummaries[topic] = text;
  }
  pruneTopicSummaries();
  return topicSummaries;
}

export function knownTopicNames(exceptFile?: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  const add = (topic: string) => {
    if (!topic || seen.has(topic)) return;
    seen.add(topic);
    names.push(topic);
  };
  for (const block of topicStore) {
    if (exceptFile && block.file_name === exceptFile) continue;
    for (const topic of block.topics) add(topic);
  }
  for (const file of knowledgeStore) {
    if (exceptFile && file.file_name === exceptFile) continue;
    for (const chunk of file.knowledge) {
      for (const topic of Object.keys(chunk.topics)) add(topic);
    }
  }
  return names;
}

export function upsertFileTopics(fileName: string, blocks: TopicBlock[]): TopicBlock[] {
  topicStore = [...topicStore.filter((block) => block.file_name !== fileName), ...blocks];
  pruneTopicSummaries();
  return topicStore;
}

export function uniqueTopicCatalog(
  blocks: TopicBlock[] = topicStore,
  summaries: Record<string, string> = topicSummaries,
  refs: ReferenceKnowledge[] = knowledgeStore,
): Record<string, string> {
  const catalog: Record<string, string> = {};
  for (const block of blocks) {
    for (const topic of block.topics) {
      if (summaries[topic]) {
        catalog[topic] = summaries[topic];
        continue;
      }
      const detail = (block.topic_details[topic] ?? "").trim();
      if (!catalog[topic]) {
        catalog[topic] = detail;
        continue;
      }
      if (detail && !catalog[topic].includes(detail)) {
        catalog[topic] = `${catalog[topic]} | ${detail}`;
      }
    }
  }
  for (const file of refs) {
    for (const chunk of file.knowledge) {
      for (const [topic, snippets] of Object.entries(chunk.topics)) {
        if (summaries[topic]) {
          catalog[topic] = summaries[topic];
          continue;
        }
        const preview = snippets.filter(Boolean).slice(0, 2).join(" ");
        if (preview && !catalog[topic]) catalog[topic] = preview;
      }
    }
  }
  for (const [topic, summary] of Object.entries(summaries)) {
    if (summary && !catalog[topic]) catalog[topic] = summary;
  }
  return catalog;
}

export function retrieveByTopics(topics: string[], blocks: TopicBlock[] = topicStore): TopicBlock[] {
  const wanted = new Set(topics);
  return blocks.filter((block) => block.topics.some((topic) => wanted.has(topic)));
}

export function getKnowledgeStore(): ReferenceKnowledge[] {
  return knowledgeStore;
}

export function upsertFileKnowledge(file: ReferenceKnowledge): ReferenceKnowledge[] {
  knowledgeStore = [
    ...knowledgeStore.filter((item) => item.file_name !== file.file_name),
    file,
  ];
  return knowledgeStore;
}

export type KnowledgeBrowseFile = {
  file_name: string;
  kind: "transcript" | "reference";
  knowledge: string[];
};

export type KnowledgeBrowseIndex = {
  topics: string[];
  summaries: Record<string, string>;
  by_topic: Record<string, KnowledgeBrowseFile[]>;
};

export function knowledgeBrowseIndex(): KnowledgeBrowseIndex {
  const topicSet = new Set(knownTopicNames());
  for (const file of knowledgeStore) {
    for (const chunk of file.knowledge) {
      for (const topic of Object.keys(chunk.topics)) {
        if (topic) topicSet.add(topic);
      }
    }
  }

  const topics = [...topicSet];
  const by_topic: Record<string, KnowledgeBrowseFile[]> = {};

  for (const topic of topics) {
    const files: KnowledgeBrowseFile[] = [];
    const transcriptByFile = new Map<string, string[]>();

    for (const block of topicStore) {
      if (!block.topics.includes(topic)) continue;
      const items = transcriptByFile.get(block.file_name) ?? [];
      const detail = (block.topic_details[topic] ?? "").trim();
      if (detail && !items.includes(detail)) items.push(detail);
      transcriptByFile.set(block.file_name, items);
    }

    for (const [file_name, knowledge] of transcriptByFile) {
      files.push({ file_name, kind: "transcript", knowledge });
    }

    for (const file of knowledgeStore) {
      const snippets: string[] = [];
      for (const chunk of file.knowledge) {
        for (const snippet of chunk.topics[topic] ?? []) {
          const text = snippet.trim();
          if (text && !snippets.includes(text)) snippets.push(text);
        }
      }
      if (snippets.length) {
        files.push({ file_name: file.file_name, kind: "reference", knowledge: snippets });
      }
    }

    by_topic[topic] = files;
  }

  const summaries: Record<string, string> = {};
  for (const topic of topics) {
    if (topicSummaries[topic]) summaries[topic] = topicSummaries[topic];
  }

  return { topics, summaries, by_topic };
}

export function retrieveReferenceKnowledge(
  topics: string[],
  store: ReferenceKnowledge[] = knowledgeStore,
): ReferenceKnowledge[] {
  const wanted = new Set(topics);
  const out: ReferenceKnowledge[] = [];
  for (const file of store) {
    const knowledge = file.knowledge
      .map((chunk) => {
        const topicsFound: Record<string, string[]> = {};
        for (const [topic, snippets] of Object.entries(chunk.topics)) {
          if (wanted.has(topic) && snippets.length) topicsFound[topic] = snippets;
        }
        return Object.keys(topicsFound).length ? { topics: topicsFound } : null;
      })
      .filter((chunk): chunk is { topics: Record<string, string[]> } => chunk !== null);
    if (knowledge.length) {
      out.push({ file_name: file.file_name, knowledge });
    }
  }
  return out;
}
