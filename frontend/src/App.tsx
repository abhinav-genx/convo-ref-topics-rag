import { useEffect, useRef, useState, type FormEvent } from "react";
import { fetchKnowledge, sendChat, uploadFile } from "./api";
import KnowledgeView from "./KnowledgeView";
import type { Attachment, FileKind, KnowledgeBrowseFile, KnowledgeBrowseIndex, Message } from "./types";

function uid(): string {
  return crypto.randomUUID();
}

export default function App() {
  const [tab, setTab] = useState<"chat" | "knowledge">("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcriptFiles, setTranscriptFiles] = useState<Attachment[]>([]);
  const [referenceDocuments, setReferenceDocuments] = useState<Attachment[]>([]);
  const [knowledgeIndex, setKnowledgeIndex] = useState<KnowledgeBrowseIndex>({
    topics: [],
    summaries: {},
    by_topic: {},
  });
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<KnowledgeBrowseFile | null>(null);
  const [draft, setDraft] = useState("");
  const [fileKind, setFileKind] = useState<FileKind | "">("");
  const [busy, setBusy] = useState<"chat" | "ocr" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const selectedTopicRef = useRef(selectedTopic);
  const selectedFileRef = useRef(selectedFile);
  selectedTopicRef.current = selectedTopic;
  selectedFileRef.current = selectedFile;

  useEffect(() => {
    localStorage.removeItem("doc-chat-conversations");
  }, []);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  async function refreshKnowledge() {
    try {
      const next = await fetchKnowledge();
      const topic =
        selectedTopicRef.current && next.topics.includes(selectedTopicRef.current)
          ? selectedTopicRef.current
          : null;
      const file = topic
        ? (next.by_topic[topic] ?? []).find(
            (item) =>
              item.file_name === selectedFileRef.current?.file_name &&
              item.kind === selectedFileRef.current?.kind,
          ) ?? null
        : null;
      setKnowledgeIndex(next);
      setSelectedTopic(topic);
      setSelectedFile(file);
    } catch {
      // Keep the last index if the browse endpoint is briefly unavailable.
    }
  }

  useEffect(() => {
    void refreshKnowledge();
  }, []);

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
      const conversation = nextMessages.map((m) => ({ role: m.role, content: m.content }));
      const reply = await sendChat(conversation, [
          ...transcriptFiles.map((a) => ({
            name: a.name,
            text: a.text,
            kind: a.kind,
            dialogues: a.dialogues,
            topics: a.topics,
          })),
          ...referenceDocuments.map((a) => ({
            name: a.name,
            text: a.text,
            kind: a.kind,
            knowledge: a.knowledge,
          })),
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

  function onNewChat() {
    if (busy) return;
    setMessages([]);
    setDraft("");
    setError(null);
    setTab("chat");
  }
    if (!fileKind) {
      setError("Select Transcript file or Reference document first.");
      return;
    }
    setError(null);
    fileInputRef.current?.click();
  }

  async function onFilePicked(file: File | undefined) {
    if (!file) return;
    if (!fileKind) {
      setError("Select Transcript file or Reference document first.");
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
        knowledge: result.knowledge,
      };

      if (fileKind === "transcript") {
        setTranscriptFiles((prev) => [...prev.filter((a) => a.name !== attachment.name), attachment]);
      } else {
        setReferenceDocuments((prev) => [...prev.filter((a) => a.name !== attachment.name), attachment]);
      }
      await refreshKnowledge();
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
              ? "Uploading..."
              : busy === "chat"
                ? "Working..."
                : "Ready"}
          </span>
        </div>

        <div className="tabs">
          <button
            type="button"
            className={`tab${tab === "chat" ? " active" : ""}`}
            onClick={() => setTab("chat")}
          >
            Chat
          </button>
          <button
            type="button"
            className={`tab${tab === "knowledge" ? " active" : ""}`}
            onClick={() => {
              setTab("knowledge");
              void refreshKnowledge();
            }}
          >
            Knowledge
          </button>
          <button
            type="button"
            className="tab new-chat"
            disabled={busy !== null}
            onClick={onNewChat}
          >
            New chat
          </button>
        </div>

        {tab === "chat" ? (
          <div className="body">
            <div className="sunken thread" ref={threadRef}>
              {messages.length === 0 && !busy && (
                <p className="empty">
                  Upload a PDF, then type a message and press Send.
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
                  <pre>Uploading PDF...</pre>
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
        ) : (
          <div className="body">
            <KnowledgeView
              index={knowledgeIndex}
              selectedTopic={selectedTopic}
              selectedFile={selectedFile}
              onSelectTopic={(topic) => {
                setSelectedTopic(topic);
                setSelectedFile(null);
              }}
              onSelectFile={setSelectedFile}
            />
          </div>
        )}

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
                checked={fileKind === "transcript"}
                onChange={() => setFileKind("transcript")}
              />
              Transcript file
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
            <button type="button" disabled={busy !== null} onClick={onNewChat}>
              New chat
            </button>
            <button type="submit" disabled={busy !== null || !draft.trim()}>
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
