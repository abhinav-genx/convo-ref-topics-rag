import { useEffect, useRef, useState, type FormEvent } from "react";
import { sendChat, uploadFile } from "./api";
import type { Attachment, FileKind, Message } from "./types";

function uid(): string {
  return crypto.randomUUID();
}

function fileList(files: Attachment[]) {
  if (!files.length) return <div className="status">None</div>;
  return (
    <ul>
      {files.map((f) => (
        <li key={f.id}>
          {f.kind === "conversation"
            ? `${f.name} (${f.topics?.length ?? 0} topics)`
            : `${f.name} (${f.pages} pg)`}
        </li>
      ))}
    </ul>
  );
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationFiles, setConversationFiles] = useState<Attachment[]>([]);
  const [referenceDocuments, setReferenceDocuments] = useState<Attachment[]>([]);
  const [draft, setDraft] = useState("");
  const [fileKind, setFileKind] = useState<FileKind | "">("");
  const [busy, setBusy] = useState<"chat" | "ocr" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.removeItem("doc-chat-conversations");
  }, []);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  async function onSend(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;

    const userMessage: Message = {
      id: uid(),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft("");
    setError(null);
    setBusy("chat");

    try {
      const reply = await sendChat(
        nextMessages.map((m) => ({ role: m.role, content: m.content })),
        [
          ...conversationFiles.map((a) => ({
            name: a.name,
            text: a.text,
            kind: a.kind,
            dialogues: a.dialogues,
          })),
          ...referenceDocuments.map((a) => ({ name: a.name, text: a.text, kind: a.kind })),
        ],
      );
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: reply,
          createdAt: Date.now(),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setBusy(null);
    }
  }

  function onBrowse() {
    if (!fileKind) {
      setError("Select Conversation file or Reference document first.");
      return;
    }
    setError(null);
    fileInputRef.current?.click();
  }

  async function onFilePicked(file: File | undefined) {
    if (!file) return;
    if (!fileKind) {
      setError("Select Conversation file or Reference document first.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setError("Only PDF files are allowed.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setError(null);
    setBusy("ocr");
    try {
      const result = await uploadFile(file, fileKind);
      const attachment: Attachment = {
        id: uid(),
        name: result.filename,
        text: result.text,
        charCount: result.charCount,
        pages: result.pages,
        kind: fileKind,
        dialogues: result.dialogues,
        topics: result.topics,
      };
      const kindLabel = fileKind === "conversation" ? "conversation file" : "reference document";
      const topicLines =
        result.topics?.map((t) => `- ${t.name}${t.summary ? `: ${t.summary}` : ""}`).join("\n") ?? "";
      const notice: Message = {
        id: uid(),
        role: "assistant",
        content: result.text
          ? fileKind === "conversation"
            ? `Uploaded ${kindLabel}: ${result.filename} (${result.dialogues?.length ?? 0} dialogues).\n\nTopics for later RAG lookup:\n${topicLines || "(none)"}`
            : `Uploaded ${kindLabel}: ${result.filename} (${result.pages} page(s), ${result.charCount} chars).`
          : `OCR ran on ${result.filename} but no text was found.`,
        createdAt: Date.now(),
      };

      if (fileKind === "conversation") {
        setConversationFiles((prev) => [...prev.filter((a) => a.name !== attachment.name), attachment]);
      } else {
        setReferenceDocuments((prev) => [...prev.filter((a) => a.name !== attachment.name), attachment]);
      }
      setMessages((prev) => [...prev, notice]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extract text");
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="app">
      <div className="window">
        <div className="titlebar">
          <span>Doc Chat</span>
          <span>
            {busy === "ocr"
              ? fileKind === "conversation"
                ? "Reading PDF + topics..."
                : "Reading PDF..."
              : busy === "chat"
                ? "Working..."
                : "Ready"}
          </span>
        </div>

        <div className="body">
          <div className="sunken thread" ref={threadRef}>
            {messages.length === 0 && !busy && (
              <p className="empty">
                Upload a PDF, then type a message and press Send.
                <br />
                Reload the page to start a new chat.
              </p>
            )}
            {messages.map((message) => (
              <div key={message.id} className="msg">
                <b>{message.role === "user" ? "You:" : "Bot:"}</b>
                <pre>{message.content}</pre>
              </div>
            ))}
            {busy === "ocr" && (
              <div className="msg">
                <b>Bot:</b>
                <pre>
                  {fileKind === "conversation"
                    ? "Reading PDF and extracting topics..."
                    : "Reading PDF with OCR..."}
                </pre>
              </div>
            )}
            {busy === "chat" && (
              <div className="msg">
                <b>Bot:</b>
                <pre>Thinking...</pre>
              </div>
            )}
          </div>
        </div>

        <div className="files">
          <div>
            <div className="panel-label">Conversation files</div>
            <div className="sunken file-box">{fileList(conversationFiles)}</div>
          </div>
          <div>
            <div className="panel-label">Reference documents</div>
            <div className="sunken file-box">{fileList(referenceDocuments)}</div>
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        <form className="composer" onSubmit={onSend}>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept="application/pdf,.pdf"
            onChange={(e) => void onFilePicked(e.target.files?.[0])}
          />

          <div className="row">
            <b>Upload PDF:</b>
            <label>
              <input
                type="radio"
                name="fileKind"
                checked={fileKind === "conversation"}
                onChange={() => setFileKind("conversation")}
              />
              Conversation file
            </label>
            <label>
              <input
                type="radio"
                name="fileKind"
                checked={fileKind === "reference"}
                onChange={() => setFileKind("reference")}
              />
              Reference document
            </label>
            <button type="button" disabled={busy !== null} onClick={onBrowse}>
              Browse...
            </button>
          </div>

          <textarea
            value={draft}
            placeholder="Type a message"
            rows={3}
            disabled={busy !== null}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="send-row">
            <button type="submit" disabled={busy !== null || !draft.trim()}>
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
