export type ConversationMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "anthropic/claude-opus-4.8";

function apiKey(): string {
  const key = process.env.OPEN_ROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY ?? "";
  if (!key) {
    throw new Error("OPEN_ROUTER_API_KEY is not set");
  }
  return key;
}

export async function askClaudeOpus(
  prompt: string,
  conversation: ConversationMessage[] = [],
): Promise<string> {
  const messages: ConversationMessage[] = [
    ...conversation,
    { role: "user", content: prompt },
  ];

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "http://localhost:5173",
      "X-Title": process.env.OPENROUTER_TITLE ?? "Doc Chat",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
    }),
  });

  const data = (await res.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!res.ok) {
    throw new Error(data.error?.message || `OpenRouter request failed (${res.status})`);
  }

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("Claude returned an empty reply");
  }
  return text;
}
