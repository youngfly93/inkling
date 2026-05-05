import { useState, useEffect, useCallback } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import {
  Star,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  MessageCircle,
  Send,
  Loader2,
} from "lucide-react";
import {
  fetchSentences,
  fetchTransforms,
  deleteSentence,
  saveTransform,
  toggleFavorite,
  type LibrarySortMode,
  type LibraryTransformFilter,
  type SavedSentence,
  type SentenceTransform,
} from "../services/db";
import { LIBRARY_UPDATED_EVENT, type LibraryUpdatedPayload } from "../services/libraryEvents";
import { askAboutSelectedText, loadAIConfig } from "./actionbar/aiClient";

const TRANSFORM_FILTERS: Array<{ id: LibraryTransformFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "ask", label: "Ask" },
  { id: "translate", label: "Translate" },
  { id: "polish", label: "Polish" },
  { id: "grammar", label: "Grammar" },
  { id: "explain", label: "Explain" },
  { id: "summarize", label: "Summarize" },
];

const SORT_OPTIONS: Array<{ id: LibrarySortMode; label: string }> = [
  { id: "updated", label: "Updated" },
  { id: "created", label: "Created" },
  { id: "favorites", label: "Favorites first" },
];

interface LibraryAskTarget {
  transformId: string;
  sentenceId: string;
  contextText: string;
}

export default function LibraryPage() {
  const [search, setSearch] = useState("");
  const [transformFilter, setTransformFilter] = useState<LibraryTransformFilter>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortMode, setSortMode] = useState<LibrarySortMode>("updated");
  const [sentences, setSentences] = useState<SavedSentence[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [transforms, setTransforms] = useState<SentenceTransform[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastSyncLabel, setLastSyncLabel] = useState("Live updates");
  const [askTarget, setAskTarget] = useState<LibraryAskTarget | null>(null);
  const [askQuestion, setAskQuestion] = useState("");
  const [askLoadingId, setAskLoadingId] = useState<string | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await fetchSentences({
      search: search || undefined,
      transformType: transformFilter,
      favoritesOnly,
      sortMode,
    });
    setSentences(data);
  }, [favoritesOnly, search, sortMode, transformFilter]);

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
      setAskTarget(null);
      return;
    }
    setExpandedId(id);
    setAskTarget(null);
    await reloadTransforms(id);
  }

  async function handleDelete(id: string) {
    await deleteSentence(id);
    setExpandedId(null);
    setAskTarget(null);
    void load();
  }

  async function handleFavorite(id: string, current: number) {
    await toggleFavorite(id, current);
    void load();
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

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
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

  const activeFilterLabel = TRANSFORM_FILTERS.find((item) => item.id === transformFilter)?.label ?? "All";
  const activeSortLabel = SORT_OPTIONS.find((item) => item.id === sortMode)?.label ?? "Updated";

  function openFollowUp(sentenceId: string, transform: SentenceTransform) {
    if (askTarget?.transformId === transform.id) {
      setAskTarget(null);
      setAskQuestion("");
      setAskError(null);
      return;
    }

    setAskTarget({
      transformId: transform.id,
      sentenceId,
      contextText: transform.output_text,
    });
    setAskQuestion("");
    setAskError(null);
  }

  async function submitFollowUp() {
    const target = askTarget;
    const question = askQuestion.trim();
    if (!target || !question || askLoadingId) {
      return;
    }

    setAskLoadingId(target.transformId);
    setAskError(null);
    try {
      const config = await loadAIConfig();
      if (!config.apiKey) {
        throw new Error("Kimi API key is missing. Open Settings and add a key first.");
      }

      const answer = await askAboutSelectedText({
        text: target.contextText,
        question,
        config,
      });

      await saveTransform(
        target.sentenceId,
        "ask",
        `${target.contextText}\n\nQ: ${question}`,
        answer,
        config.model
      );

      const payload: LibraryUpdatedPayload = {
        sentenceId: target.sentenceId,
        transformType: "ask",
        savedAt: new Date().toISOString(),
      };
      await emit(LIBRARY_UPDATED_EVENT, payload).catch(() => {});
      await Promise.all([load(), reloadTransforms(target.sentenceId)]);
      setLastSyncLabel("Updated just now");
      setAskTarget(null);
      setAskQuestion("");
    } catch (e) {
      console.error("Library follow-up ask failed:", e);
      setAskError(e instanceof Error ? e.message : String(e));
    } finally {
      setAskLoadingId(null);
    }
  }

  return (
    <div className="library-container">
      <div className="library-search">
        <div className="library-search-row">
          <input
            type="text"
            placeholder="Search original, results, source, model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="library-filter-row" aria-label="Filter by action">
          {TRANSFORM_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`library-filter ${transformFilter === item.id ? "is-active" : ""}`}
              onClick={() => setTransformFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="library-toolbar-row">
          <button
            type="button"
            className={`library-filter ${favoritesOnly ? "is-active" : ""}`}
            onClick={() => setFavoritesOnly((value) => !value)}
          >
            Favorites
          </button>
          <label className="library-sort-control">
            <span>Sort</span>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as LibrarySortMode)}>
              {SORT_OPTIONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {sentences.length === 0 ? (
        <div className="library-empty">
          <span>{search || transformFilter !== "all" || favoritesOnly ? "No matches" : "No saved sentences yet"}</span>
          <span style={{ fontSize: 12 }}>
            {favoritesOnly
              ? "No favorite results in this view."
              : transformFilter === "all"
                ? "Library is empty."
                : "This action filter has no saved results."}
          </span>
        </div>
      ) : (
        <div className="library-list">
          {sentences.map((s) => (
            <div key={s.id}>
              <div
                className={`sentence-row ${expandedId === s.id ? "is-expanded" : ""}`}
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

              {expandedId === s.id && transforms.length > 0 && (
                <div className="library-transform-list">
                  {transforms.map((t) => (
                    <div key={t.id} className="library-transform-card">
                      <div className="library-transform-head">
                        <div>
                          <span className="library-transform-type">
                            {formatTransformType(t.transform_type)}
                          </span>
                          {t.model_name && <span className="library-transform-model">{t.model_name}</span>}
                        </div>
                        <span>{formatDate(t.created_at)} · {formatTime(t.created_at)}</span>
                      </div>
                      <div className="library-transform-output">
                        {t.output_text}
                      </div>
                      <div className="library-transform-actions">
                        <button
                          type="button"
                          className="library-action-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            openFollowUp(s.id, t);
                          }}
                        >
                          <MessageCircle size={12} />
                          Ask
                        </button>
                        <button
                          className="btn-icon"
                          title="Copy"
                          onClick={() => handleCopy(t.output_text, t.id)}
                        >
                          {copiedId === t.id ? (
                            <Check size={12} color="#22c55e" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </div>
                      {askTarget?.transformId === t.id && (
                        <div className="library-ask-panel">
                          <textarea
                            value={askQuestion}
                            onChange={(event) => setAskQuestion(event.target.value)}
                            placeholder="Ask about this saved result..."
                            rows={3}
                          />
                          {askError && <div className="library-ask-error">{askError}</div>}
                          <div className="library-ask-actions">
                            <button
                              type="button"
                              className="library-action-btn"
                              onClick={() => {
                                setAskTarget(null);
                                setAskQuestion("");
                                setAskError(null);
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="library-ask-submit"
                              disabled={!askQuestion.trim() || askLoadingId === t.id}
                              onClick={() => void submitFollowUp()}
                            >
                              {askLoadingId === t.id ? <Loader2 size={12} className="spin" /> : <Send size={12} />}
                              Ask
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="library-status">
        <span>
          {sentences.length} sentences · {activeFilterLabel} · {activeSortLabel}
          {favoritesOnly ? " · Favorites" : ""}
        </span>
        <span>{lastSyncLabel}</span>
      </div>
    </div>
  );
}
