export const LIBRARY_UPDATED_EVENT = "library-updated";

export interface LibraryUpdatedPayload {
  sentenceId: string;
  transformType: string;
  savedAt: string;
}
