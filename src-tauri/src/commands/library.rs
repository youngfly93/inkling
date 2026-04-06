use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create sentence tables",
        sql: "
            CREATE TABLE IF NOT EXISTS saved_sentences (
                id TEXT PRIMARY KEY,
                original_text TEXT NOT NULL,
                source_app TEXT,
                source_url TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                note TEXT,
                text_hash TEXT NOT NULL UNIQUE
            );

            CREATE TABLE IF NOT EXISTS sentence_transforms (
                id TEXT PRIMARY KEY,
                sentence_id TEXT NOT NULL,
                transform_type TEXT NOT NULL,
                input_text TEXT NOT NULL,
                output_text TEXT NOT NULL,
                model_name TEXT,
                prompt_version TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (sentence_id) REFERENCES saved_sentences(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_sentences_hash ON saved_sentences(text_hash);
            CREATE INDEX IF NOT EXISTS idx_sentences_created ON saved_sentences(created_at);
            CREATE INDEX IF NOT EXISTS idx_transforms_sentence ON sentence_transforms(sentence_id);
        ",
        kind: MigrationKind::Up,
    }]
}

#[tauri::command]
pub async fn save_sentence(
    original_text: String,
    source_app: Option<String>,
    source_url: Option<String>,
) -> Result<String, String> {
    // Compute hash
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(original_text.as_bytes());
    let hash = format!("{:x}", hasher.finalize());

    let id = uuid_v4();
    let now = chrono::Utc::now().to_rfc3339();

    // Return the insert params as JSON — actual SQL execution happens from frontend
    // via tauri-plugin-sql's direct execute API
    let result = serde_json::json!({
        "id": id,
        "original_text": original_text,
        "source_app": source_app,
        "source_url": source_url,
        "created_at": now,
        "updated_at": now,
        "is_favorite": 0,
        "text_hash": hash,
    });

    Ok(result.to_string())
}

fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{:032x}", ts)
}
