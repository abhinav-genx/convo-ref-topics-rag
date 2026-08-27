export type Role = "user" | "assistant";

export type FileKind = "conversation" | "reference";

export type Topic = {
  name: string;
  summary: string;
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
  topics?: Topic[];
};
