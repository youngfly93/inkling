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

#[tauri::command]
pub async fn transform_text(
    text: String,
    action: String,
    api_key: String,
    api_host: String,
    model: String,
) -> Result<String, String> {
    let prompt = match action.as_str() {
        "to_english" => format!(
            "Rewrite the following text into natural, polished English. \
             Preserve the original meaning. Do not invent facts. \
             Return only the rewritten text.\n\nText: {}",
            text
        ),
        "to_chinese" => format!(
            "将以下文本翻译为自然、流畅的简体中文。\
             保留原文含义，不要编造内容。\
             仅返回翻译后的中文文本。\n\n文本：{}",
            text
        ),
        "expand" => format!(
            "Expand the following text into a fuller, clearer, and more polished version. \
             Keep the original intent and tone. Do not add fabricated facts. \
             Return only the expanded text.\n\nText: {}",
            text
        ),
        _ => return Err(format!("Unknown action: {}", action)),
    };

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
