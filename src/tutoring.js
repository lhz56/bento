// Tutoring inside a lesson: a quick question about its code, a second opinion from your other AI, and checking an
// explanation you give back in your own words. Each function asks your AI once and returns plain data; it never
// throws, so a failed call becomes an answer that says what went wrong. useTutor (src/hooks/useTutor.js) puts the
// results into the lesson.
import { parseJSONLoose } from './lesson.js';
import { cleanErr } from './bridgeError.js';

/**
 * @typedef {(model: string, prompt: string) => Promise<string>} Quick  one short call to an AI (api.quick)
 * @typedef {{ id: string, title?: string, lang?: string, code?: string, work?: string,
 *   story?: Array<{ md?: string, text?: string }>, concepts?: string[], chat?: ChatEntry[] }} Lesson
 * @typedef {{ q: string, choices: string[], answer: number, why?: string }} Check
 * @typedef {{ id?: string, q: string, a?: string, loading?: boolean, term?: string, plain?: string, by?: string,
 *   next?: string[], check?: Check | null, second?: { who: string, a?: string, loading?: boolean } }} ChatEntry
 * @typedef {{ term: string, plain: string }} Word
 * @typedef {{ said: string, score: number, got: string[], missing: string[], next: string }} TeachBack
 */

export const NO_AI_ANSWER =
  'Bento needs an AI to answer questions. Connect one (bottom-left → **Connect an AI**): Claude, ChatGPT, Gemini or Copilot, on the plan you already have.';

// the code a tutor sees: the learner's own edit if there is one, with line numbers for [[3-5|links]]
/** @param {Lesson} lesson */
export const numberedCode = (lesson) =>
  (lesson.work ?? lesson.code ?? '')
    .split('\n')
    .map((line, i) => `${i + 1}| ${line}`)
    .join('\n')
    .slice(0, 5000);

// a multiple-choice check is kept only if it's well formed: 2+ choices and an answer that is one of them
/** @returns {Check | null} */
export const validCheck = (check) =>
  check &&
  Array.isArray(check.choices) &&
  check.choices.length >= 2 &&
  Number.isInteger(check.answer) &&
  check.answer >= 0 &&
  check.answer < check.choices.length
    ? check
    : null;

/**
 * A question asked inside a lesson, answered in a few sentences with what to ask next.
 * @param {{ quick: Quick, model: string, level: string, lesson: Lesson, question: string }} args
 * @returns {Promise<{ entry: ChatEntry, word: Word | null }>} the chat entry, and a new word to learn if it used one
 */
export async function askQuickQuestion({ quick, model, level, lesson, question }) {
  const history = (lesson.chat || [])
    .slice(-3)
    .map((entry) => `Q: ${entry.q}\nA: ${entry.a}`)
    .join('\n');
  try {
    const reply = parseJSONLoose(
      await quick(
        model,
        `You are tutoring a ${level} learner inside a lesson titled "${lesson.title}".\nThe lesson's ${lesson.lang} code (with line numbers):\n${numberedCode(lesson)}\n${history ? `\nEarlier in this chat:\n${history}\n` : ''}\nThe learner asks: ${question}\nAnswer warmly and precisely in at most 110 words. You may use **bold**, \`code\` and line links like [[3-5|the loop]] that point at lines of the code above.\nAlso suggest 2 short questions they might ask next (at most 8 words each). If, and only if, the answer teaches something checkable, add one quick multiple-choice check about it (3 choices, one right); otherwise check is null.\nReply JSON: {"answer":"...","term":"a technical term you used that they may not know, or null","plain":"one-line definition of it, or null","next":["...","..."],"check":{"q":"...","choices":["...","...","..."],"answer":0,"why":"one sentence"}}`,
      ),
    );
    if (!reply?.answer)
      return {
        entry: { q: question, a: 'I couldn’t answer that one. Try making it a full lesson.' },
        word: null,
      };
    return {
      entry: {
        q: question,
        a: reply.answer,
        term: reply.term,
        plain: reply.plain,
        by: model,
        next: (Array.isArray(reply.next) ? reply.next : [])
          .filter((x) => typeof x === 'string' && x.trim())
          .slice(0, 2),
        check: validCheck(reply.check),
      },
      word: reply.term && reply.plain ? { term: reply.term, plain: reply.plain } : null,
    };
  } catch {
    return {
      entry: { q: question, a: 'The model didn’t answer. Check your connection and try again.' },
      word: null,
    };
  }
}

/**
 * Your other AI reads a chat answer and agrees, adds what was missed, or politely corrects it.
 * @param {{ quick: Quick, model: string, level: string, lesson: Lesson, entry: ChatEntry }} args
 * @returns {Promise<string>} its answer
 */
export async function askSecondOpinion({ quick, model, level, lesson, entry }) {
  try {
    const reply = parseJSONLoose(
      await quick(
        model,
        `You are tutoring a ${level} learner inside a lesson titled "${lesson.title}".\nThe lesson's ${lesson.lang} code (with line numbers):\n${numberedCode(lesson)}\n\nThe learner asks: ${entry.q}\nAnother tutor already answered: "${entry.a}"\nGive YOUR answer in at most 90 words: agree, add what they missed, or politely correct them. You may use **bold**, \`code\` and [[line|links]].\nReply JSON: {"answer":"..."}`,
      ),
    );
    return reply?.answer || 'No answer this time.';
  } catch {
    return 'That model didn’t answer. Is it signed in?';
  }
}

/**
 * Explaining it back: the learner says what they understood (or, for a puzzle, talks through their solution as in
 * an interview) and gets a 0–3 score, what they got right, the most important gap, and a question to go further.
 * @param {{ quick: Quick, model: string, level: string, lesson: Lesson, said: string,
 *   puzzle?: { title: string, md: string, target: string } | null, code?: string }} args
 * @returns {Promise<TeachBack>}
 */
export async function assessTeachBack({ quick, model, level, lesson, said, puzzle, code }) {
  const prompt = puzzle
    ? `You are a warm, fair coding interviewer. The candidate (a ${level}) is solving the puzzle "${puzzle.title}":\n${puzzle.md}\nThe best known approach runs in ${puzzle.target}.\nTheir current Python code:\n${(code ?? lesson.work ?? lesson.code).slice(0, 4000)}\n\nThey talk you through their solution:\n"${said}"\n\nJudge the explanation the way a good interviewer would: is the idea right, do they know why it works, and do they state its time complexity correctly (for THEIR code)? Judge understanding, not grammar. Score 0–3 (3 = you'd hire on this answer).\nReply JSON: {"score":0-3,"got":["what they explained well, ≤ 14 words each, max 2"],"missing":["the most important gap, said plainly, ≤ 22 words, max 2; empty if score is 3"],"next":"the follow-up question an interviewer would ask next, ≤ 18 words"}`
    : `A ${level} learner just finished a lesson titled "${lesson.title}" (concepts: ${(lesson.concepts || []).join(', ')}).\nLESSON TEXT:\n${lessonText(lesson)}\n\nThey explained it back in their own words:\n"${said}"\n\nBe a warm, honest tutor. Judge understanding, not grammar or spelling. Score 0–3 (0 = wrong idea, 1 = partly, 2 = right but missing one key piece, 3 = solid).\nReply JSON: {"score":0-3,"got":["what they got right, ≤ 14 words each, max 2"],"missing":["the most important missing or wrong piece, said plainly, ≤ 22 words, max 2; empty if score is 3"],"next":"one short question that would push them further, ≤ 18 words"}`;
  let reply;
  try {
    reply = parseJSONLoose(await quick(model, prompt));
  } catch (err) {
    reply = { score: 0, got: [], missing: [cleanErr(err)], next: '' };
  }
  if (!reply)
    reply = {
      score: 0,
      got: [],
      missing: ['Couldn’t read the answer this time. Try again.'],
      next: '',
    };
  return {
    said,
    score: Math.max(0, Math.min(3, +reply.score || 0)),
    got: reply.got || [],
    missing: reply.missing || [],
    next: reply.next || '',
  };
}

// the lesson's story as plain text, for a tutor to compare an explanation against
/** @param {Lesson} lesson */
const lessonText = (lesson) =>
  (lesson.story || [])
    .map((block) => block.md || block.text || '')
    .filter(Boolean)
    .join('\n')
    .slice(0, 3500);
