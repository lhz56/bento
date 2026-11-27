// Tutoring commands for the open lesson (src/tutoring.js does the asking): each one writes its result into that
// lesson, by id, so an answer that arrives after you moved on still lands in the right place.
import { noAI } from '../ai.js';
import { newChatId, putChatEntry } from '../lesson.js';
import { addWord } from '../progress.js';
import { puzzleById } from '../puzzles.js';
import { askQuickQuestion, askSecondOpinion, assessTeachBack, NO_AI_ANSWER } from '../tutoring.js';
import { modelLabel } from '../ui/Side.jsx';

export default function useTutor({
  api,
  lesson,
  settings,
  providers,
  altFor,
  desk,
  setLessons,
  setProgress,
}) {
  const updateLesson = (id, change) =>
    setLessons((ls) => ls.map((l) => (l.id === id ? { ...l, ...change(l) } : l)));
  const ask = { quick: api.quick, level: settings.level };

  const quickAsk = async (question) => {
    const asked = lesson;
    const entryId = newChatId();
    const put = (entry) =>
      updateLesson(asked.id, (l) => ({ chat: putChatEntry(l.chat, { ...entry, id: entryId }) }));
    if (noAI(providers)) return put({ q: question, a: NO_AI_ANSWER });
    put({ q: question, loading: true });
    const { entry, word } = await askQuickQuestion({
      ...ask,
      model: settings.model,
      lesson: asked,
      question,
    });
    put(entry);
    if (word) setProgress((prev) => addWord(prev, { ...word, from: asked.id, title: asked.title }));
  };

  // chat entries only ever get added, so an entry's index is stable
  const secondOpinion = async (index) => {
    const asked = lesson;
    const entry = asked.chat[index];
    const model = altFor(entry.by || settings.model);
    if (!model) return;
    const who = modelLabel(model);
    const setSecond = (second) =>
      updateLesson(asked.id, (l) => ({
        chat: l.chat.map((x, k) => (k === index ? { ...x, second } : x)),
      }));
    setSecond({ who, loading: true });
    setSecond({ who, a: await askSecondOpinion({ ...ask, model, lesson: asked, entry }) });
  };

  const teachBack = noAI(providers)
    ? null
    : async (asked, said) => {
        const teach = await assessTeachBack({
          ...ask,
          model: settings.model,
          lesson: asked,
          said,
          puzzle: asked.puzzle ? puzzleById(asked.puzzle) : null,
          code: desk.current?.getCode?.(),
        });
        updateLesson(asked.id, () => ({ teach }));
      };

  return { quickAsk, secondOpinion, teachBack };
}
