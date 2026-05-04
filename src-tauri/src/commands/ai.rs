use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

fn build_transform_prompt(text: &str, action: &str) -> Result<String, String> {
    match action {
        "translate" => Ok(format!(
            "Translate the following selected text. \
             If the text is primarily Chinese, translate it into natural, polished English. \
             Otherwise, translate it into natural, polished Simplified Chinese. \
             Preserve meaning, names, numbers, formatting, and tone. Do not invent facts. \
             Return only the translated text.\n\nSelected text:\n{}",
            text
        )),
        "polish" => Ok(format!(
            "Polish the following selected text in the same language. \
             Make it clearer, smoother, and more natural while preserving the original meaning and tone. \
             Do not expand with new facts. \
             Return only the polished text.\n\nSelected text:\n{}",
            text
        )),
        "grammar" => Ok(format!(
            "Correct grammar, spelling, punctuation, and awkward phrasing in the following selected text. \
             Keep the same language, meaning, structure, and tone as much as possible. \
             Make only necessary corrections. \
             Return only the corrected text.\n\nSelected text:\n{}",
            text
        )),
        "explain" => Ok(format!(
            "Explain the following selected text clearly and concisely. \
             Identify the main point, important context, and any terms that may be hard to understand. \
             Use the same language as the selected text unless another language is clearly more useful. \
             Return only the explanation.\n\nSelected text:\n{}",
            text
        )),
        "summarize" => Ok(format!(
            "Summarize the following selected text into a concise, useful summary. \
             Keep the key points and avoid adding information that is not present in the text. \
             Use the same language as the selected text. \
             Return only the summary.\n\nSelected text:\n{}",
            text
        )),
        _ => Err(format!("Unknown action: {}", action)),
    }
}

fn build_custom_prompt(text: &str, mode: &str, instruction: &str) -> Result<String, String> {
    match mode {
        "ask" => Ok(format!(
            "You are helping a user understand selected text from another app.\n\
             Use the selected text as your primary source.\n\
             Answer the user's question directly and clearly.\n\
             If the question cannot be answered from the selected text alone, say that briefly and then give the best grounded answer you can.\n\
             Return only the answer.\n\n\
             Selected text:\n{}\n\n\
             User question:\n{}",
            text, instruction
        )),
        _ => Err(format!("Unknown custom mode: {}", mode)),
    }
}

async fn run_chat_completion(
    prompt: String,
    api_key: String,
    api_host: String,
    model: String,
) -> Result<String, String> {
    let host = if api_host.is_empty() {
        "api.moonshot.cn".to_string()
    } else {
        api_host
    };

    let model_name = if model.is_empty() {
        "moonshot-v1-8k".to_string()
    } else {
        model
    };

    let url = format!("https://{}/v1/chat/completions", host);

    let body = ChatRequest {
        model: model_name,
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
        }],
        stream: false,
    };

    let client = Client::new();
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("API error ({}): {}", status, body));
    }

    let chat_resp: ChatResponse = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    chat_resp
        .choices
        .first()
        .map(|c| c.message.content.clone())
        .ok_or_else(|| "Empty response".to_string())
}

#[tauri::command]
pub async fn transform_text(
    text: String,
    action: String,
    api_key: String,
    api_host: String,
    model: String,
) -> Result<String, String> {
    let prompt = build_transform_prompt(&text, &action)?;
    run_chat_completion(prompt, api_key, api_host, model).await
}

#[tauri::command]
pub async fn custom_text_action(
    text: String,
    mode: String,
    instruction: String,
    api_key: String,
    api_host: String,
    model: String,
) -> Result<String, String> {
    let trimmed_instruction = instruction.trim();
    if trimmed_instruction.is_empty() {
        return Err("Custom instruction is empty".to_string());
    }

    let prompt = build_custom_prompt(&text, &mode, trimmed_instruction)?;
    run_chat_completion(prompt, api_key, api_host, model).await
}
