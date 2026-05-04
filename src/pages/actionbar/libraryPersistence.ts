import { saveSentence as dbSave, saveTransform } from "../../services/db";

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
}) {
  try {
    const sentenceId = await dbSave(text, app, url);
    await saveTransform(sentenceId, type, inputText, outputText, model);
  } catch {
    // Best effort: action results should still be shown even if persistence fails.
  }
}
