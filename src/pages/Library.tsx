import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { Star, Trash2, Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import {
  fetchSentences,
  fetchTransforms,
  deleteSentence,
  toggleFavorite,
  type SavedSentence,
  type SentenceTransform,
} from "../services/db";
import { LIBRARY_UPDATED_EVENT, type LibraryUpdatedPayload } from "../services/libraryEvents";

export default function LibraryPage() {
  const [search, setSearch] = useState("");
  const [sentences, setSentences] = useState<SavedSentence[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [transforms, setTransforms] = useState<SentenceTransform[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastSyncLabel, setLastSyncLabel] = useState("Live updates");

  const load = useCallback(async () => {
    const data = await fetchSentences(search || undefined);
    setSentences(data);
  }, [search]);

  const reloadTransforms = useCallback(async (sentenceId: string | null) => {
    if (!sentenceId) {
      setTransforms([]);
      return;
    }

    const data = await fetchTransforms(sentenceId);
    setTransforms(data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let active = true;

    const unlistenPromise = listen<LibraryUpdatedPayload>(LIBRARY_UPDATED_EVENT, (event) => {
      if (!active) return;

      void load();
      if (event.payload.sentenceId === expandedId) {
        void reloadTransforms(expandedId);
      }
      setLastSyncLabel("Updated just now");
    });

    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [expandedId, load, reloadTransforms]);

  useEffect(() => {
    const handleFocus = () => {
      void load();
      if (expandedId) {
        void reloadTransforms(expandedId);
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [expandedId, load, reloadTransforms]);

  async function handleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setTransforms([]);
      return;
    }
    setExpandedId(id);
    await reloadTransforms(id);
  }

  async function handleDelete(id: string) {
    await deleteSentence(id);
    setExpandedId(null);
    load();
  }

  async function handleFavorite(id: string, current: number) {
    await toggleFavorite(id, current);
    load();
  }

  function handleCopy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1200);
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function appLabel(bundleId: string | null): string {
    if (!bundleId) return "";
    const parts = bundleId.split(".");
    return parts[parts.length - 1] || bundleId;
  }

  function formatTransformType(type: string): string {
    switch (type) {
      case "translate":
        return "Translate";
      case "polish":
        return "Polish";
      case "grammar":
        return "Grammar";
      case "explain":
        return "Explain";
      case "summarize":
        return "Summarize";
      case "to_english":
        return "To English";
      case "to_chinese":
        return "To Chinese";
      case "expand":
        return "Expand";
      default:
        return type;
    }
  }

  return (
    <div className="library-container">
      <div className="library-search">
        <input
          type="text"
          placeholder="Search sentences..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      {sentences.length === 0 ? (
        <div className="library-empty">
          <span style={{ fontSize: 36, opacity: 0.5 }}>📚</span>
          <span>{search ? "No matches" : "No saved sentences yet"}</span>
          <span style={{ fontSize: 12 }}>
            {"Select text anywhere -> run an Inkling action"}
          </span>
        </div>
      ) : (
        <div className="library-list">
          {sentences.map((s) => (
            <div key={s.id}>
              <div
                className="sentence-row"
                onClick={() => handleExpand(s.id)}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                  <span style={{ marginTop: 2, opacity: 0.4, flexShrink: 0 }}>
                    {expandedId === s.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sentence-text">{s.original_text}</div>
                    <div className="sentence-meta">
                      {s.source_app && (
                        <span className="tag">{appLabel(s.source_app)}</span>
                      )}
                      {s.source_url && (
                        <span style={{ color: "var(--accent)" }}>
                          {(() => {
                            try { return new URL(s.source_url).hostname; }
                            catch { return ""; }
                          })()}
                        </span>
                      )}
                      <span>{formatDate(s.created_at)}</span>
                      <span style={{ flex: 1 }} />
                      <button
                        className="btn-icon"
                        title="Copy"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(s.original_text, s.id);
                        }}
                      >
                        {copiedId === s.id ? <Check size={13} color="#22c55e" /> : <Copy size={13} />}
                      </button>
                      <button
                        className="btn-icon"
                        title={s.is_favorite ? "Unfavorite" : "Favorite"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFavorite(s.id, s.is_favorite);
                        }}
                      >
                        <Star
                          size={13}
                          fill={s.is_favorite ? "#facc15" : "none"}
                          color={s.is_favorite ? "#facc15" : "currentColor"}
                        />
                      </button>
                      <button
                        className="btn-icon"
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(s.id);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded: show transforms */}
              {expandedId === s.id && transforms.length > 0 && (
                <div
                  style={{
                    padding: "8px 14px 12px 34px",
                    borderBottom: "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                >
                  {transforms.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        marginBottom: 8,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        fontSize: 12,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 4,
                          color: "var(--muted)",
                          fontSize: 11,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {formatTransformType(t.transform_type)}
                        </span>
                        <span>{formatDate(t.created_at)}</span>
                      </div>
                      <div style={{ lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                        {t.output_text}
                      </div>
                      <div style={{ textAlign: "right", marginTop: 4 }}>
                        <button
                          className="btn-icon"
                          onClick={() => handleCopy(t.output_text, t.id)}
                        >
                          {copiedId === t.id ? (
                            <Check size={12} color="#22c55e" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="library-status">
        <span>{sentences.length} sentences</span>
        <span>{lastSyncLabel}</span>
      </div>
    </div>
  );
}
