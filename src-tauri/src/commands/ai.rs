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

fn build_translate_prompt(text: &str, translate_mode: Option<&str>) -> String {
    let target_instruction = match translate_mode.unwrap_or("auto") {
        "to_chinese" => {
            "Translate it into natural, polished Simplified Chinese. \
             If parts are already Chinese, keep their meaning and make the full result read naturally in Chinese."
        }
        "to_english" => {
            "Translate it into natural, polished English. \
             If parts are already English, keep their meaning and make the full result read naturally in English."
        }
        _ => {
            "Detect the dominant language first. \
             If the text is primarily Chinese, translate it into natural, polished English. \
             If the text is primarily English, translate it into natural, polished Simplified Chinese. \
             If Chinese and English are mixed, use the dominant language to decide the opposite target language. \
             If there is no clear dominant language, translate into Simplified Chinese by default."
        }
    };

    format!(
        "Translate the following selected text. \
         {} \
         Preserve meaning, names, numbers, formatting, code identifiers, URLs, product names, and tone. \
         Do not invent facts. \
         Return only the translated text.\n\nSelected text:\n{}",
        target_instruction, text
    )
}

fn build_polish_prompt(
    text: &str,
    polish_style: Option<&str>,
    polish_custom_instruction: Option<&str>,
) -> String {
    let trimmed_custom = polish_custom_instruction.unwrap_or("").trim();
    let style_instruction = match polish_style.unwrap_or("balanced") {
        "concise" => {
            "Make it tighter and more concise. Remove redundancy, but keep important meaning and nuance."
        }
        "formal" => {
            "Make it more formal, composed, and suitable for professional or public-facing writing."
        }
        "friendly" => {
            "Make it warmer, clearer, and more approachable without becoming casual or salesy."
        }
        "professional" => {
            "Make it sharper, confident, and businesslike while keeping it readable and natural."
        }
        "custom" if !trimmed_custom.is_empty() => trimmed_custom,
        _ => {
            "Make it clearer, smoother, and more natural. Improve flow without changing the author's intent."
        }
    };

    format!(
        "Polish the following selected text in the same language. \
         Follow this polish direction: {} \
         Preserve the original meaning, facts, names, numbers, formatting, and tone unless the direction explicitly asks for a tone adjustment. \
         Do not invent facts. Do not explain your changes. \
         Return only the polished text.\n\nSelected text:\n{}",
        style_instruction, text
    )
}

fn build_transform_prompt(
    text: &str,
    action: &str,
    translate_mode: Option<&str>,
    polish_style: Option<&str>,
    polish_custom_instruction: Option<&str>,
) -> Result<String, String> {
    match action {
        "translate" => Ok(build_translate_prompt(text, translate_mode)),
        "polish" => Ok(build_polish_prompt(
            text,
            polish_style,
            polish_custom_instruction,
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
             Use the same language as the selected text. If the selected text contains Chinese, answer in Simplified Chinese. \
             Do not switch to English unless the selected text is primarily English. \
             Return only the explanation.\n\nSelected text:\n{}",
            text
        )),
        "summarize" => Ok(format!(
            "Summarize the following selected text into a concise, useful summary. \
             Keep the key points and avoid adding information that is not present in the text. \
             Use the same language as the selected text. If the selected text contains Chinese, answer in Simplified Chinese. \
             Do not switch to English unless the selected text is primarily English. \
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
             Answer in the same language as the user's question. If the question contains Chinese, answer in Simplified Chinese.\n\
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
    translate_mode: Option<String>,
    polish_style: Option<String>,
    polish_custom_instruction: Option<String>,
) -> Result<String, String> {
    let prompt = build_transform_prompt(
        &text,
        &action,
        translate_mode.as_deref(),
        polish_style.as_deref(),
        polish_custom_instruction.as_deref(),
    )?;
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
