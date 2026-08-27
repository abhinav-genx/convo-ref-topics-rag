import type { KnowledgeBrowseFile, KnowledgeBrowseIndex } from "./types";

type Props = {
  index: KnowledgeBrowseIndex;
  selectedTopic: string | null;
  selectedFile: KnowledgeBrowseFile | null;
  onSelectTopic: (topic: string) => void;
  onSelectFile: (file: KnowledgeBrowseFile) => void;
};

function topicLabel(topic: string) {
  return topic.replace(/_/g, " ");
}

export default function KnowledgeView({
  index,
  selectedTopic,
  selectedFile,
  onSelectTopic,
  onSelectFile,
}: Props) {
  const files = selectedTopic ? (index.by_topic[selectedTopic] ?? []) : [];
  const knowledge = selectedFile?.knowledge ?? [];
  const summary = selectedTopic ? (index.summaries[selectedTopic] ?? "") : "";

  return (
    <div className="knowledge">
      <div className="sunken knowledge-summary">
        {!selectedTopic ? (
          <div className="status">Select a topic to see its running summary.</div>
        ) : summary ? (
          <p>{summary}</p>
        ) : (
          <div className="status">No running summary yet for {topicLabel(selectedTopic)}.</div>
        )}
      </div>
      <div className="knowledge-col">
        <div className="panel-label">Topics</div>
        <div className="sunken knowledge-list">
          {index.topics.length === 0 ? (
            <div className="status">Upload a transcript or reference PDF.</div>
          ) : (
            index.topics.map((topic) => (
              <button
                key={topic}
                type="button"
                className={topic === selectedTopic ? "selected" : ""}
                onClick={() => onSelectTopic(topic)}
              >
                {topicLabel(topic)}
                <span className="count">{index.by_topic[topic]?.length ?? 0}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="knowledge-col">
        <div className="panel-label">
          {selectedTopic ? `Files: ${topicLabel(selectedTopic)}` : "Files"}
        </div>
        <div className="sunken knowledge-list">
          {!selectedTopic ? (
            <div className="status">Select a topic.</div>
          ) : files.length === 0 ? (
            <div className="status">No files have knowledge on this topic yet.</div>
          ) : (
            files.map((file) => {
              const active =
                selectedFile?.file_name === file.file_name && selectedFile.kind === file.kind;
              return (
                <button
                  key={`${file.kind}:${file.file_name}`}
                  type="button"
                  className={active ? "selected" : ""}
                  onClick={() => onSelectFile(file)}
                >
                  {file.file_name}
                  <span className="count">{file.kind}</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="knowledge-col">
        <div className="panel-label">
          {selectedFile ? `Knowledge: ${selectedFile.file_name}` : "Knowledge"}
        </div>
        <div className="sunken knowledge-detail">
          {!selectedFile ? (
            <div className="status">Select a file.</div>
          ) : knowledge.length === 0 ? (
            <div className="status">This file is tagged with the topic, but no notes were stored.</div>
          ) : (
            <ul>
              {knowledge.map((item, i) => (
                <li key={`${selectedFile.file_name}-${i}`}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
