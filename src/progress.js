// Your word list: each technical word a lesson, a chat answer or a project's reading taught you, kept once (the
// first time it came up) under its lower-case spelling.

/**
 * @param {{ words?: Record<string, object> }} progress
 * @param {{ term: string, plain?: string, like?: string, from?: string | null, title?: string }} word
 */
export const addWord = (progress, word) => {
  const key = String(word.term).toLowerCase();
  if (progress.words?.[key]) return progress;
  return { ...progress, words: { ...(progress.words || {}), [key]: { ...word, at: Date.now() } } };
};
