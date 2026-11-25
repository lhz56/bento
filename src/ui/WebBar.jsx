// The web version's two additions (web.js): a small pill saying this is Bento in a browser, and the sheet that
// opens when you try something only the Mac app can do (a new question, another repo, a website).
import { useEffect, useState } from 'react';
import { DOWNLOAD, count } from '../web.js';

const WHY = {
  lesson: 'Asking your own questions',
  quick: 'Asking about this',
  repo: 'Taking apart any repo',
  site: 'Taking apart a website',
  folder: 'Opening your own code',
  atlas: 'Reading a new project',
};

export default function WebBar() {
  const [why, setWhy] = useState(null);
  useEffect(() => {
    const on = (e) => setWhy(WHY[e.detail] || 'This');
    addEventListener('bento:needs-mac', on); return () => removeEventListener('bento:needs-mac', on);
  }, []);
  useEffect(() => {
    if (!why) return undefined;
    const esc = (e) => { if (e.key === 'Escape') setWhy(null); };
    addEventListener('keydown', esc); return () => removeEventListener('keydown', esc);
  }, [why]);
  return (
    <>
      <a className="web-pill" href={DOWNLOAD} target="_top" onClick={() => count('get_mac', 'pill')}>
        <span><span className="web-dot" aria-hidden="true" />Web preview</span><b>Get the Mac app</b>
      </a>
      {why && (
        <div className="web-veil" onClick={() => setWhy(null)}>
          <div className="web-sheet" role="dialog" aria-modal="true" aria-labelledby="web-sheet-h" onClick={(e) => e.stopPropagation()}>
            <div className="onb-logo mini" aria-hidden="true"><span className="b1" /><span className="b2" /><span className="b3" /></div>
            <h2 id="web-sheet-h">{why} needs the Mac app.</h2>
            <p>It uses the AI you already have (Claude, ChatGPT, Gemini or Copilot) to write new lessons. Free, no account.</p>
            <div className="web-acts">
              <a className="btn" href={DOWNLOAD} target="_top" onClick={() => count('get_mac', 'sheet')}>Get Bento for Mac</a>
              <button className="btn ghost" type="button" onClick={() => setWhy(null)} autoFocus>Keep exploring</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
