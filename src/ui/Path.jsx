import { useEffect, useState } from 'react';
// "From zero to a real app": one clear trail instead of a skill graph. Each stop is a lesson;
// the last stops connect to Explore (a real app) and Clever ideas.
export const TRACKS = [
  ['app', 'Zero to a real app', 'Eleven short stops from “what is a program?” to building your first app.', 'Your own to-do web app that remembers your tasks.'],
  ['web', 'How the web works', 'From pressing Enter to a page on your screen, and everything in between.', 'You can take apart a real website and say how every piece works.'],
  ['ai', 'AI from scratch', 'What a model really is, built up from tiny programs you can run.', 'A tiny next-word predictor, and how chatbots pick their words.'],
];
export const WEB = [
  { id: 'w1', t: 'What happens when you press Enter', d: 'Your browser asks a faraway computer for a page. Watch the conversation.', q: 'What happens when I type a web address and press Enter? Simulate the request and response step by step', words: ['browser', 'server', 'request'] },
  { id: 'w2', t: 'HTML: the skeleton', d: 'Pages are nested boxes of text and tags.', q: 'What is HTML? Build a tiny page and show how nested tags become boxes inside boxes', lang: 'html', words: ['HTML', 'tag', 'DOM'] },
  { id: 'w3', t: 'CSS: the clothes', d: 'Rules that decide colours, sizes and layout.', q: 'How does CSS style a page? Build a small card and let me change colours, spacing and layout', lang: 'html', words: ['CSS', 'selector'] },
  { id: 'w4', t: 'JavaScript: making it react', d: 'Clicks, typing and changes on the page.', q: 'How do clicks on a web page run code? Build a page with a button and a counter', lang: 'html', words: ['event', 'handler'] },
  { id: 'w5', t: 'HTTP and status codes', d: '200, 404, 500: the numbers servers answer with.', q: 'What is HTTP and what do status codes like 200, 404 and 500 mean? Simulate a tiny server', words: ['HTTP', 'status code'] },
  { id: 'w6', t: 'APIs and JSON', d: 'How apps ask other apps for data.', q: 'What is a REST API and JSON? Simulate a weather API and a client with pretend responses', words: ['API', 'JSON', 'endpoint'] },
  { id: 'w7', t: 'Logging in', d: 'Passwords, hashing and the cookie that remembers you.', q: 'How does logging in to a website work? Simulate password hashing and session cookies', words: ['hash', 'cookie', 'session'] },
  { id: 'w8', t: 'Where data lives', d: 'Databases, tables and the queries that find things.', q: 'How do websites store data in a database? Simulate a table, an index and a query', words: ['database', 'query', 'index'] },
  { id: 'w9', t: 'Take apart a real website', d: 'See all of this in a site you use every day.', site: true, words: ['CDN', 'DNS'] },
];
export const AI = [
  { id: 'a1', t: 'A model is a guessing machine', d: 'Inputs in, a guess out. Start with the simplest one.', q: 'What is a machine learning model, really? Show a tiny model that guesses house prices from size', words: ['model', 'prediction'] },
  { id: 'a2', t: 'Learning by nudging', d: 'Make a guess, measure the mistake, nudge, repeat.', q: 'How does a model learn? Simulate gradient descent fitting a line, and draw the line improving', words: ['loss', 'gradient descent'] },
  { id: 'a3', t: 'Neurons', d: 'Tiny weighted votes that add up to decisions.', q: 'What is a neuron in a neural network? Build one that learns AND and OR from examples', words: ['neuron', 'weight', 'activation'] },
  { id: 'a4', t: 'A small neural network', d: 'Stack neurons in layers and they can learn curves.', q: 'Build a tiny neural network that learns XOR, and show how its error drops', words: ['layer', 'backpropagation'] },
  { id: 'a5', t: 'Words as numbers', d: 'Tokens and embeddings: how text becomes math.', q: 'How do language models turn words into numbers? Show tokens and a tiny embedding space where similar words are close', words: ['token', 'embedding'] },
  { id: 'a6', t: 'Predicting the next word', d: 'The core trick behind chatbots, in miniature.', q: 'How does a language model predict the next word? Build a tiny next-word predictor from a few sentences', words: ['language model', 'probability'] },
  { id: 'a7', t: 'Attention', d: 'How a model decides which earlier words matter.', q: 'What is attention in transformers? Simulate attention scores on a short sentence and draw them as a grid', words: ['attention', 'transformer'] },
  { id: 'a8', t: 'How chatbots answer you', d: 'Prompts, sampling and temperature.', q: 'How do chatbots like Claude or ChatGPT choose their words? Simulate sampling with temperature', words: ['prompt', 'temperature', 'sampling'] },
];
export const STOPS = [
  { id: 'p1', t: 'What is a program?', d: 'Instructions, one line at a time. Make the computer say and draw things.', q: 'What is a program? Show me the smallest useful one, with print and show()', words: ['program', 'statement'] },
  { id: 'p2', t: 'Boxes with names', d: 'Variables remember things: a score, a name, a list of todos.', q: 'Teach me variables with a tiny game score example', words: ['variable', 'value'] },
  { id: 'p3', t: 'Making decisions', d: 'if this, do that. How apps react to what you do.', q: 'Teach me if/else with a password-check example', words: ['condition', 'boolean'] },
  { id: 'p4', t: 'Doing things again', d: 'Loops: the computer never gets bored.', q: 'Teach me loops by drawing a pattern', words: ['loop', 'iteration'] },
  { id: 'p5', t: 'Recipes you can reuse', d: 'Functions: name a set of steps and use it anywhere.', q: 'Teach me functions with a tip-calculator example', words: ['function', 'parameter', 'return'] },
  { id: 'p6', t: 'Lists and lookups', d: 'How apps hold many things: lists, and dictionaries for fast lookups.', q: 'Teach me lists and dictionaries with a contacts app example', words: ['list', 'dictionary'] },
  { id: 'p7', t: 'Talking to the internet', d: 'APIs and JSON: how apps ask other apps for data.', q: 'What is an API and JSON? Show a weather-app style example using a pretend response (no real network)', words: ['API', 'JSON', 'request'] },
  { id: 'p8', t: 'Remembering forever', d: 'Databases: why apps don’t lose your stuff when you close them.', q: 'What is a database? Show saving and finding todos with a tiny in-memory table', words: ['database', 'query'] },
  { id: 'p9', t: 'How a real app fits together', d: 'Front end, back end, database, outside services. See it in a real project.', explore: true, words: ['front end', 'back end'] },
  { id: 'p11', t: 'Build your first app', d: 'A real to-do app in your browser, built step by step. Every step runs.', q: 'a tiny to-do list web app: add tasks, tick them off, delete them, and remember them when the page reloads', lang: 'html', mode: 'build', words: ['state', 'event', 'localStorage'] },
  { id: 'p10', t: 'Putting it online', d: 'Hosting, servers and deploys: how your app reaches everyone.', q: 'How does an app get from my laptop onto the internet? Explain hosting and deploys with a simple simulation', words: ['hosting', 'deploy'] },
];

export default function Path({ done, onStart, onExplore, onIdeas, onSite, level, custom = [], onMakePath, onDropPath }) {
  const [track, setTrack] = useState(() => localStorage.getItem('bento.track') || 'app');
  useEffect(() => localStorage.setItem('bento.track', track), [track]);
  const mine = custom.find((c) => c.id === track);
  const LIST = mine ? mine.stops : track === 'web' ? WEB : track === 'ai' ? AI : STOPS;
  const listOf = (k) => (custom.find((c) => c.id === k)?.stops || (k === 'web' ? WEB : k === 'ai' ? AI : STOPS));
  const [goal, setGoal] = useState(''); const [making, setMaking] = useState(null);
  const n = LIST.filter((s) => done[s.id]).length;
  const [party, setParty] = useState(false);
  useEffect(() => { const k = `bento.pathSeen.${track}`; const seen = +localStorage.getItem(k) || 0; if (n > seen) { setParty(true); setTimeout(() => setParty(false), 2200); } localStorage.setItem(k, String(n)); }, [n, track]);
  const next = LIST.find((s) => !done[s.id]);
  const T = mine ? [mine.id, mine.title, mine.d, mine.end] : TRACKS.find(([k]) => k === track) || TRACKS[0];
  const mins = LIST.reduce((a, s) => a + (+s.mins || 8), 0);
  const go = (s) => (s.explore ? onExplore(s) : s.site ? onSite(s) : onStart(s));
  const nextI = next ? LIST.indexOf(next) : -1;
  return (
    <div className="explore">
      <div className="ex-inner path-inner">
        <div className="hello">The path</div>
        <h1 className="home-h">Learn it <em>in order</em>.</h1>
        <div className="ptabs">
          {[...TRACKS, ...custom.map((c) => [c.id, c.title])].map(([k, t]) => {
            const L2 = listOf(k); const d2 = L2.filter((x) => done[x.id]).length; const own = custom.some((c) => c.id === k);
            return (
              <button key={k} className={`ptab ${track === k ? 'on' : ''} ${own ? 'own' : ''}`} onClick={() => setTrack(k)}>
                <Ring f={d2 / L2.length} />{own && <span className="ptab-own">✦</span>}{t}<span className="ptab-n">{d2}/{L2.length}</span>
                {own && <em className="track-x" title="Remove this path" onClick={(e) => { e.stopPropagation(); onDropPath(k); setTrack('app'); }}>×</em>}
              </button>
            );
          })}
        </div>
        <form className={`make-path ${making === 'busy' ? 'busy' : ''}`} onSubmit={async (e) => { e.preventDefault(); if (!goal.trim() || !onMakePath) return; setMaking('busy'); try { const id = await onMakePath(goal.trim()); setGoal(''); setMaking(null); if (id) setTrack(id); } catch (err) { setMaking(String(err.message || err)); } }}>
          <span>✦</span><input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Make your own path: “learn SQL”, “how React works”, “build a Discord bot”…" disabled={making === 'busy'} />
          <button className="btn" disabled={!goal.trim() || making === 'busy'}>{making === 'busy' ? 'Designing your path…' : 'Make it'}</button>
        </form>
        {making && making !== 'busy' && <div className="story-err" style={{ marginBottom: 14 }}>{making}</div>}
        {party && <div className="path-party">{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ '--i': i }} />)}<span>Stop complete! {n} of {LIST.length}</span></div>}

        <div className="phero" key={track}>
          <div className="phero-main">
            <div className="phero-k">{mine ? 'your path' : 'path'} · {LIST.length} stops · about {Math.round(mins / 5) * 5} min</div>
            <h2>{T[1]}</h2>
            <p>{T[2]}</p>
            {T[3] && <div className="phero-end"><span>🏁</span><div><i>Where it ends</i>{T[3]}</div></div>}
          </div>
          <div className="phero-side">
            <div className="phero-prog"><Ring f={n / LIST.length} size={64} /><div><b>{n}</b><span>of {LIST.length} done</span></div></div>
            {next ? <button className="btn" onClick={() => go(next)}>{n ? 'Continue' : 'Start'}: stop {nextI + 1} <span>→</span></button> : <span className="phero-done">Finished. Nice work.</span>}
            {next && <span className="phero-next">{next.t}</span>}
          </div>
        </div>

        <div className="trail">
          <svg className="trail-road" viewBox="0 0 100 1000" preserveAspectRatio="none" aria-hidden="true">
            <path d="M50 0 C 64 50, 64 50, 50 100 S 36 150, 50 200 S 64 250, 50 300 S 36 350, 50 400 S 64 450, 50 500 S 36 550, 50 600 S 64 650, 50 700 S 36 750, 50 800 S 64 850, 50 900 S 36 950, 50 1000" />
          </svg>
          {LIST.map((s, i) => {
            const isDone = !!done[s.id]; const isNext = next?.id === s.id;
            return (
              <div key={s.id} className={`stop ${i % 2 ? 'r' : 'l'} ${isDone ? 'done' : ''} ${isNext ? 'next' : ''}`} style={{ animationDelay: `${i * 50}ms` }}>
                <span className="stop-n">{isDone ? '✓' : i + 1}</span>
                <div className="stop-card">
                  {isNext && <span className="here">you are here</span>}
                  <b>{s.t}</b>
                  <span>{s.d}</span>
                  {s.make && <span className="stop-make"><i>you’ll make</i>{s.make}</span>}
                  <div className="stop-words">{(s.words || []).map((w) => <i key={w}>{w}</i>)}</div>
                  <div className="stop-foot">
                    <button className={isNext ? 'btn' : 'btn ghost'} onClick={() => go(s)}>{isDone ? 'Open again' : s.explore ? 'Take apart a real app' : s.site ? 'Take apart a website' : 'Start'}</button>
                    <span className="stop-min">{+s.mins || 8} min</span>
                  </div>
                </div>
              </div>
            );
          })}
          {T[3] && <div className={`stop-flag ${next ? '' : 'done'}`}><span>🏁</span><b>{T[3]}</b></div>}
          <div className="stop-end"><b>Then keep going</b><span>Read how Uber, Google and Stripe solved hard problems.</span><button className="btn" onClick={onIdeas}>Clever ideas →</button></div>
        </div>
      </div>
    </div>
  );
}

function Ring({ f = 0, size = 18 }) {
  const r = size / 2 - (size > 30 ? 5 : 2.5), c = 2 * Math.PI * r;
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" strokeWidth={size > 30 ? 6 : 3} />
      {f > 0 && <circle cx={size / 2} cy={size / 2} r={r} className="ring-fg" strokeWidth={size > 30 ? 6 : 3} strokeDasharray={`${c * Math.min(1, f)} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
    </svg>
  );
}
