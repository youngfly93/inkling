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
  await d.execute(
    `INSERT INTO sentence_transforms (id, sentence_id, transform_type, input_text, output_text, model_name, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [uuid(), sentenceId, type, inputText, outputText, modelName || null, nowISO()]
  );
}

// Fetch all sentences
export async function fetchSentences(search?: string): Promise<SavedSentence[]> {
  const d = await getDb();
  if (search && search.trim()) {
    return d.select<SavedSentence[]>(
      "SELECT * FROM saved_sentences WHERE original_text LIKE $1 ORDER BY created_at DESC",
      [`%${search}%`]
    );
  }
  return d.select<SavedSentence[]>(
    "SELECT * FROM saved_sentences ORDER BY created_at DESC",
    []
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
