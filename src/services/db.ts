import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:seleany.db");
  }
  return db;
}

export interface SavedSentence {
  id: string;
  original_text: string;
  source_app: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
  is_favorite: number;
  note: string | null;
  text_hash: string;
}

export interface SentenceTransform {
  id: string;
  sentence_id: string;
  transform_type: string;
  input_text: string;
  output_text: string;
  model_name: string | null;
  prompt_version: string | null;
  created_at: string;
}

export type LibraryTransformFilter =
  | "all"
  | "ask"
  | "translate"
  | "polish"
  | "grammar"
  | "explain"
  | "summarize";

export type LibrarySortMode = "updated" | "created" | "favorites";

export interface FetchSentencesOptions {
  search?: string;
  transformType?: LibraryTransformFilter;
  favoritesOnly?: boolean;
  sortMode?: LibrarySortMode;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function uuid(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

// Save a sentence (dedup by hash)
export async function saveSentence(
  text: string,
  sourceApp?: string | null,
  sourceUrl?: string | null
): Promise<string> {
  const d = await getDb();
  const hash = await sha256Hex(text);

  // Check existing
  const existing = await d.select<SavedSentence[]>(
    "SELECT * FROM saved_sentences WHERE text_hash = $1",
    [hash]
  );

  if (existing.length > 0) {
    await d.execute(
      "UPDATE saved_sentences SET updated_at = $1 WHERE id = $2",
      [nowISO(), existing[0].id]
    );
    return existing[0].id;
  }

  const id = uuid();
  await d.execute(
    `INSERT INTO saved_sentences (id, original_text, source_app, source_url, created_at, updated_at, is_favorite, text_hash)
     VALUES ($1, $2, $3, $4, $5, $5, 0, $6)`,
    [id, text, sourceApp || null, sourceUrl || null, nowISO(), hash]
  );
  return id;
}

// Save a transform result
export async function saveTransform(
  sentenceId: string,
  type: string,
  inputText: string,
  outputText: string,
  modelName?: string
): Promise<void> {
  const d = await getDb();
  const timestamp = nowISO();
  await d.execute(
    `INSERT INTO sentence_transforms (id, sentence_id, transform_type, input_text, output_text, model_name, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [uuid(), sentenceId, type, inputText, outputText, modelName || null, timestamp]
  );
  await d.execute(
    "UPDATE saved_sentences SET updated_at = $1 WHERE id = $2",
    [timestamp, sentenceId]
  );
}

// Fetch all sentences
export async function fetchSentences(options?: string | FetchSentencesOptions): Promise<SavedSentence[]> {
  const d = await getDb();
  const search = typeof options === "string" ? options : options?.search;
  const transformType = typeof options === "string" ? "all" : options?.transformType ?? "all";
  const favoritesOnly = typeof options === "string" ? false : options?.favoritesOnly ?? false;
  const sortMode: LibrarySortMode = typeof options === "string" ? "updated" : options?.sortMode ?? "updated";
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (search && search.trim()) {
    const index = params.length + 1;
    params.push(`%${search.trim()}%`);
    clauses.push(
      `(s.original_text LIKE $${index}
        OR s.source_app LIKE $${index}
        OR s.source_url LIKE $${index}
        OR EXISTS (
          SELECT 1 FROM sentence_transforms t_search
          WHERE t_search.sentence_id = s.id
            AND (
              t_search.input_text LIKE $${index}
              OR t_search.output_text LIKE $${index}
              OR t_search.transform_type LIKE $${index}
              OR t_search.model_name LIKE $${index}
            )
        ))`
    );
  }

  if (transformType !== "all") {
    const index = params.length + 1;
    params.push(transformType);
    clauses.push(
      `EXISTS (
        SELECT 1 FROM sentence_transforms t_filter
        WHERE t_filter.sentence_id = s.id
          AND t_filter.transform_type = $${index}
      )`
    );
  }

  if (favoritesOnly) {
    clauses.push("s.is_favorite = 1");
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const orderBy =
    sortMode === "created"
      ? "s.created_at DESC, s.updated_at DESC"
      : sortMode === "favorites"
        ? "s.is_favorite DESC, s.updated_at DESC, s.created_at DESC"
        : "s.updated_at DESC, s.created_at DESC";

  return d.select<SavedSentence[]>(
    `SELECT DISTINCT s.*
     FROM saved_sentences s
     ${where}
     ORDER BY ${orderBy}`,
    params
  );
}

// Fetch transforms for a sentence
export async function fetchTransforms(sentenceId: string): Promise<SentenceTransform[]> {
  const d = await getDb();
  return d.select<SentenceTransform[]>(
    "SELECT * FROM sentence_transforms WHERE sentence_id = $1 ORDER BY created_at DESC",
    [sentenceId]
  );
}

// Delete a sentence
export async function deleteSentence(id: string): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM sentence_transforms WHERE sentence_id = $1", [id]);
  await d.execute("DELETE FROM saved_sentences WHERE id = $1", [id]);
}

// Toggle favorite
export async function toggleFavorite(id: string, current: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE saved_sentences SET is_favorite = $1, updated_at = $2 WHERE id = $3",
    [current ? 0 : 1, nowISO(), id]
  );
}

// Update note
export async function updateNote(id: string, note: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE saved_sentences SET note = $1, updated_at = $2 WHERE id = $3",
    [note, nowISO(), id]
  );
}
