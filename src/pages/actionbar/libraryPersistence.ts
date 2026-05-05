import { emit } from "@tauri-apps/api/event";
import { saveSentence as dbSave, saveTransform } from "../../services/db";
import { LIBRARY_UPDATED_EVENT, type LibraryUpdatedPayload } from "../../services/libraryEvents";

export async function saveTransformResultBestEffort({
  text,
  app,
  url,
  type,
  inputText,
  outputText,
  model,
}: {
  text: string;
  app: string | null;
  url: string | null;
  type: string;
  inputText: string;
  outputText: string;
  model: string;
}): Promise<LibraryUpdatedPayload | null> {
  try {
    const sentenceId = await dbSave(text, app, url);
    await saveTransform(sentenceId, type, inputText, outputText, model);
    const payload = {
      sentenceId,
      transformType: type,
      savedAt: new Date().toISOString(),
    };
    await emit(LIBRARY_UPDATED_EVENT, payload).catch(() => {});
    return payload;
  } catch {
    // Best effort: action results should still be shown even if persistence fails.
    return null;
  }
}
