export const TOPIC_KEY_RULES = `Topic keys are short lowercase words joined with underscores (examples: check_in, grievance, internal_programming, effective_intervention).

Transcripts and reference documents each extract their own topics independently.
- A reference PDF does not need a matching transcript topic.
- A transcript does not need a matching reference topic.
- Reuse an existing key only when the subject is the same. Never invent a synonym (not economic_outlook if economy exists).
- Do not force unrelated facts onto an existing key (a program catalog is not substance_evaluation; NIC principles are not check_in).`;

export function topicKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function reuseCatalogPrompt(existingTopics: string[]): string {
  if (!existingTopics.length) {
    return "No topic keys exist yet. Create new underscore keys for every distinct subject in this slice.";
  }
  return `Optional reuse catalog (transcripts and reference docs). Independent new keys are expected when this slice has its own subjects:\n${existingTopics.join(", ")}`;
}
