import { useState, useRef, useEffect } from 'react';
import { describeView, lessonFromAgent, describeRun, agentName } from '../agent.js';
import { api } from '../bridge.js';

// Your own AI agent uses Bento (electron/agent.cjs). Its tool calls arrive here: show its lesson, say what's on
// screen, point at lines, run code. Answers are words for it. noteFlash is a note it just pinned, shown open.
export default function useAgentBridge({
  atlasKey,
  current,
  desk,
  openLesson,
  patch,
  runs,
  setLinkRange,
  setPal,
  setShowSettings,
  view,
}) {
  const [noteFlash, setNoteFlash] = useState(null); // { from, at }: a note your agent just pinned, shown open
  const runWaits = useRef([]); // tool calls waiting for a lesson's code to finish running
  const agentNow = useRef(/** @type {Record<string, any>} */ ({}));
  agentNow.current = { view, current, runs, openLesson, patch, atlasKey };
  useEffect(
    () =>
      api.agent?.on(async (tool, a, client) => {
        const now = agentNow.current;
        const ran = (id, ms) =>
          new Promise((res) => {
            const w = { id, res };
            runWaits.current.push(w);
            setTimeout(() => {
              runWaits.current = runWaits.current.filter((x) => x !== w);
              res(null);
            }, ms);
          });
        const later =
          'It is still running (Python takes a few seconds the first time). Call get_learner_view in a moment to see what it did.';
        if (tool === 'show_lesson') {
          const lesson = lessonFromAgent(a, client);
          const done = ran(lesson.id, 30000);
          now.openLesson(lesson);
          setShowSettings(false);
          setPal(false);
          const r = await done;
          return `Bento is showing "${lesson.title}" to the learner.\n\nWhen its code ran:\n${r ? describeRun(r.r) : later}`;
        }
        if (tool === 'get_learner_view')
          return describeView({
            view: now.view,
            lesson: now.current,
            code: now.view === 'lesson' ? desk.current?.getCode?.() : null,
            run: now.current ? now.runs[now.current.id] : null,
            project: now.view === 'atlas' ? now.atlasKey : null,
          });
        const lesson = now.view === 'lesson' ? now.current : null;
        if (!lesson || !desk.current)
          throw new Error('No lesson is open in Bento. Use show_lesson to open one.');
        if (tool === 'highlight_code') {
          const n = (desk.current.getCode() ?? lesson.code).split('\n').length;
          if (a.from > n)
            throw new Error(`The code has ${n} lines; line ${a.from} isn’t one of them.`);
          const to = Math.min(a.to, n);
          setLinkRange([a.from, to]);
          if (a.note)
            now.patch(lesson.id, {
              notes: [
                ...(lesson.notes || []).filter((x) => x.from !== a.from),
                { from: a.from, to, label: a.label || agentName(client), text: a.note },
              ].slice(-8),
            });
          if (a.note) setNoteFlash({ from: a.from, at: Date.now() });
          return `Lines ${a.from}${to > a.from ? `–${to}` : ''} are lit up in Bento${a.note ? ', with your note beside them' : ''}.`;
        }
        if (tool === 'run_code') {
          if (a.code != null) desk.current.setCode(a.code);
          const done = ran(lesson.id, 30000);
          setTimeout(() => desk.current?.run(), 40);
          const r = await done;
          return r
            ? `${a.code != null ? 'Put your code in the editor and ran it.' : 'Ran the learner’s code.'}\n\n${describeRun(r.r)}`
            : later;
        }
        throw new Error(`Bento has no tool called ${tool}.`);
      }),
    [],
  );
  return { noteFlash, runWaits };
}
