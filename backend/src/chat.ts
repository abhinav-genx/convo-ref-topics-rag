import { splitDialogues } from "./dialogues.js";
import { askClaudeOpus, type ConversationMessage } from "./openrouter.js";

export type ChatMessage = ConversationMessage;

type DocumentContext = {
  name: string;
  text: string;
  kind?: "conversation" | "reference";
  dialogues?: string[];
};

function conversationLines(doc: DocumentContext): string[] {
  return doc.dialogues ?? splitDialogues(doc.text);
}

function section(title: string, docs: DocumentContext[]): string {
  if (!docs.length) return "";
  const body = docs
    .map((doc) => {
      if (doc.kind === "conversation") {
        return `${doc.name}\n${conversationLines(doc).join("\n")}`;
      }
      return `${doc.name}\n${doc.text.slice(0, 40_000)}`;
    })
    .join("\n\n====\n\n");
  return `${title}:\n\n${body}`;
}

function buildSystemPrompt(documents: DocumentContext[]): string {
  const intro =
    "You are a helpful assistant. Answer clearly and concisely. Conversation files are prior chats or transcripts. Reference documents are supporting material. Prefer conversation files for what was said; use reference documents for facts and background. If OCR text looks noisy, infer carefully and say when you are unsure.";

  const conversationFiles = documents.filter((d) => d.kind === "conversation");
  const referenceDocuments = documents.filter((d) => d.kind !== "conversation");
  const parts = [
    intro,
    section("Conversation files", conversationFiles),
    section("Reference documents", referenceDocuments),
  ].filter(Boolean);

  return parts.join("\n\n");
}

export async function completeChat(
  messages: ChatMessage[],
  documents: DocumentContext[],
): Promise<string> {
  const history = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-20);

  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content;
  if (!lastUser) {
    throw new Error("No user prompt to send");
  }

  const prior = history.slice(0, -1);
  const conversation: ConversationMessage[] = [
    { role: "system", content: buildSystemPrompt(documents) },
    ...prior,
  ];

  return askClaudeOpus(lastUser, conversation);
}
