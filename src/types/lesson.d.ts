// The shape of a lesson, as src/lesson.js makes it (emptyLesson) and fills it while your AI writes it (applyBlock).
// Only for the type checker (npm run typecheck): components and modules refer to it as
// import('../types/lesson').Lesson.

/** One block of a lesson's story, in the order it reads. `t` says what kind of block it is. */
export interface StoryBlock {
  t: 'p' | 'h' | 'quiz' | 'try' | 'next' | 'term' | 'step' | 'viz' | 'img' | string;
  md?: string;
  text?: string;
  items?: string[];
  q?: string;
  choices?: string[];
  answer?: number;
  why?: string;
  i?: number;
  [field: string]: unknown;
}

/** A stop in a lesson that's built up step by step (a "build" lesson, or a recipe). */
export interface Step {
  title: string;
  md?: string;
  code: string;
  file?: string;
}

/** A note pinned beside lines of the code (by the lesson, or by your agent). */
export interface Note {
  from: number;
  to?: number;
  label: string;
  text?: string;
}

/** A question asked inside a lesson, and its answer. */
export interface ChatEntry {
  id?: string;
  q: string;
  a?: string;
  loading?: boolean;
  term?: string;
  plain?: string;
  by?: string;
  next?: string[];
  check?: { q: string; choices: string[]; answer: number; why?: string } | null;
  second?: { who: string; a?: string; loading?: boolean };
}

export interface Lesson {
  id: string;
  /** the question that asked for it */
  q: string;
  mode: 'explain' | 'code' | 'compare' | 'feature' | 'build' | 'challenge' | 'idea' | string;
  lang: 'python' | 'javascript' | 'typescript' | 'html' | 'sql' | string;
  level?: 'kid' | 'student' | 'engineer' | string;
  model?: string;
  createdAt: number;
  status: 'streaming' | 'done' | 'error' | string;
  error?: string | null;
  title: string;
  kicker?: string;
  concepts: string[];
  story: StoryBlock[];
  code: string;
  file?: string;
  /** plain English for each line of the code, in order */
  pseudo: string[];
  notes: Note[];
  growth?: { call?: string; calls?: { label: string; call: string }[]; setup?: string } | null;
  tests?: { fn: string; cases: { args: unknown[]; expect: unknown }[] } | null;
  hints?: string[];
  /** words the lesson defines as it goes (term blocks) */
  terms?: StoryBlock[];
  steps: Step[];
  twin?: unknown;
  /** your own edit of the code, kept with the lesson */
  work?: string | null;
  context?: Record<string, any> | null;
  chat?: ChatEntry[];
  /** several files, for a small project (files[0] is the one that runs) */
  files?: { name: string; code: string }[];
  /** plain English for lines written after the lesson came (line text -> words) */
  pmap?: Record<string, string>;
  teach?: { said: string; score: number; got: string[]; missing: string[]; next: string };
  checks?: { ok: boolean; at: number }[];
  check?: { at: number; local?: unknown[]; corrections?: unknown[]; by?: string };
  repaired?: string;
  puzzle?: string;
  race?: boolean;
  builtin?: boolean;
  touched?: boolean;
  scratch?: boolean;
  shared?: boolean;
  agent?: unknown;
  routed?: { from: string; to: string; why: string };
  thinking?: string | null;
  /** the title of the lesson this one follows on from */
  prevTitle?: string;
  /** how it was asked (question and options), kept while it streams so it can be asked again */
  _ask?: { q: string; o: Record<string, any> };
}
