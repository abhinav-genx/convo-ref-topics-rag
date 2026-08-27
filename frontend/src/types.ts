export type Role = "user" | "assistant";

export type FileKind = "transcript" | "reference";

export type TopicBlock = {
  file_name: string;
  id: string;
  dialogues: string[];
  topics: string[];
  topic_details: Record<string, string>;
};

export type ReferenceKnowledge = {
  file_name: string;
  knowledge: {
    topics: Record<string, string[]>;
  }[];
};

export type KnowledgeBrowseFile = {
  file_name: string;
  kind: FileKind;
  knowledge: string[];
};

export type KnowledgeBrowseIndex = {
  topics: string[];
  summaries: Record<string, string>;
  by_topic: Record<string, KnowledgeBrowseFile[]>;
};

export type Message = {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
};

export type Attachment = {
  id: string;
  name: string;
  text: string;
  charCount: number;
  pages: number;
  kind: FileKind;
  dialogues?: string[];
  topics?: TopicBlock[];
  knowledge?: ReferenceKnowledge;
};
