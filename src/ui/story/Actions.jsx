// A lesson's own buttons: read it aloud, publish it as a web page, share it as a file, and copy it as Markdown notes.
import { useState, useEffect } from 'react';
import { lessonHtml } from '../../exportHtml.js';
import { t } from '../../i18n.js';

// Read the lesson aloud with the Mac's own voice (Web Speech, fully local).
const plainText = (md) =>
  String(md || '')
    .replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\*\*|\*|`/g, '');

export function Listen({ lesson }) {
  const [on, setOn] = useState(false);
  useEffect(() => () => window.speechSynthesis?.cancel(), [lesson.id]);
  if (!window.speechSynthesis) return null;
  const go = () => {
    const sy = window.speechSynthesis;
    if (on) {
      sy.cancel();
      setOn(false);
      return;
    }
    const parts = [
      lesson.title,
      ...lesson.story
        .map((b) =>
          b.t === 'p'
            ? plainText(b.md)
            : b.t === 'h'
              ? b.text
              : b.t === 'term'
                ? `New word: ${b.term}. ${b.plain}`
                : b.t === 'step'
                  ? `${lesson.steps[b.i]?.title}. ${plainText(lesson.steps[b.i]?.md)}`
                  : '',
        )
        .filter(Boolean),
    ];
    const lg = document.documentElement.lang || 'en';
    const vs = sy.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lg));
    const voice =
      vs.find((v) => /Samantha|Daniel|Karen|Ava|Serena|Premium|Enhanced/i.test(v.name)) || vs[0];
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);
      u.lang = lg;
      if (voice) u.voice = voice;
      u.rate = 1.02;
      if (i === parts.length - 1) u.onend = () => setOn(false);
      sy.speak(u);
    });
    setOn(true);
  };
  return (
    <button className={`listen ${on ? 'on' : ''}`} onClick={go}>
      {on ? '■ ' + t('Stop') : '▶ ' + t('Listen')}
    </button>
  );
}

// The whole lesson as Markdown notes (story, code, words), for Notion, Obsidian or a README.
const strip = (md) => String(md || '').replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, '$1');

export function lessonMd(lesson) {
  const out = [`# ${lesson.title}`, ''];
  if (lesson.q) out.push(`> ${lesson.q}`, '');
  const code = lesson.work ?? lesson.code;
  let codeDone = false;
  for (const block of lesson.story) {
    if (block.t === 'p') out.push(strip(block.md), '');
    else if (block.t === 'h') out.push(`## ${block.text}`, '');
    else if (block.t === 'term')
      out.push(`**${block.term}**: ${block.plain}${block.like ? ` _(${block.like})_` : ''}`, '');
    else if (block.t === 'step') {
      const st = lesson.steps[block.i];
      out.push(
        `### ${block.i + 1}. ${st.title}${st.file ? ` (\`${st.file}\`)` : ''}`,
        strip(st.md),
        '',
      );
    } else if (block.t === 'quiz')
      out.push(
        `**Check:** ${block.q}`,
        ...block.choices.map((c, i) => `- ${i === block.answer ? '✅' : '▫️'} ${c}`),
        `_${block.why}_`,
        '',
      );
    if (!codeDone && code && block.t === 'p' && out.length > 6) {
      out.push('```' + (lesson.lang || ''), code, '```', '');
      codeDone = true;
    }
  }
  if (!codeDone && code) out.push('```' + (lesson.lang || ''), code, '```', '');
  if ((lesson.chat || []).length) {
    out.push('## Questions I asked');
    lesson.chat.forEach((c) => out.push(`**Q:** ${c.q}`, `${strip(c.a)}`, ''));
  }
  out.push('_Made with Bento_');
  return out.join('\n');
}

export function WebPageBtn({ lesson }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="listen"
      title="Save as a web page anyone can open in a browser, with code they can run"
      onClick={async () => {
        const f = await window.bento.saveWeb(lessonHtml(lesson), lesson.title);
        if (f) {
          setOk(true);
          setTimeout(() => setOk(false), 2500);
        }
      }}
    >
      {ok ? '✓ Saved to Desktop' : '◫ Web page'}
    </button>
  );
}

export function ShareBtn({ lesson }) {
  const [ok, setOk] = useState(null);
  const go = async () => {
    const { thinking, _ask, ...rest } = lesson; // keep everything that makes the lesson work, nothing that doesn't
    const result = await window.bento.exportLesson({
      ...rest,
      chat: rest.chat?.filter((c) => !c.loading),
    });
    if (result) {
      setOk(result.split('/').pop());
      setTimeout(() => setOk(null), 2500);
    }
  };
  return (
    <button
      className="listen"
      onClick={go}
      title="Save as a .bento file anyone can drop onto Bento"
    >
      {ok ? `✓ Saved ${ok}` : '⇪ Share'}
    </button>
  );
}

export function CopyNotes({ lesson }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="listen"
      onClick={() => {
        navigator.clipboard?.writeText(lessonMd(lesson));
        setOk(true);
        setTimeout(() => setOk(false), 1400);
      }}
    >
      {ok ? '✓ ' + t('Copied') : '⧉ ' + t('Copy as notes')}
    </button>
  );
}
