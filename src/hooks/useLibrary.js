import { useEffect, useRef, useState } from 'react';
import { ndjsonParser } from '../lesson.js';
import {
  ANALYSIS_VERSION,
  applyNarr,
  buildAtlasPrompt,
  detectStack,
  emptyNarr,
} from '../atlas/analyze.js';
import { addWord } from '../progress.js';
import { detectSite, buildSitePrompt } from '../atlas/site.js';
import { load, save, cleanErr } from '../store.js';
import FEATURED from '../atlas-featured.json';
import { altOf } from '../ai.js';
export { FEATURED };

// Everything about bringing code in from outside: GitHub repos and local folders (the Atlas),
// websites, the Projects list, and the narration that explains them. App.jsx just uses the results.
export default function useLibrary({
  api,
  settings,
  setProgress,
  setProjectRaw,
  setViewRaw,
  getProviders = () => null,
}) {
  const [atlases, setAtlases] = useState({});
  const [atlasKey, setAtlasKey] = useState(null);
  const [projects, setProjects] = useState(() => load('bento.projects', []));
  const atlasRef = useRef({});
  atlasRef.current = atlases;
  useEffect(() => save('bento.projects', projects.slice(0, 200)), [projects]);
  const [sites, setSites] = useState({});
  const [siteKey, setSiteKey] = useState(null);
  // ---------------------------------------------------------------- Atlas: bring a repo in, take it apart
  const patchAtlas = (key, p) =>
    setAtlases((m) => ({
      ...m,
      [key]: { ...m[key], ...(typeof p === 'function' ? p(m[key]) : p) },
    }));
  const asProject = (atlas) => ({
    kind: atlas.src.kind,
    root: atlas.src.root,
    name: atlas.name,
    atlasKey: atlas.key,
    files: atlas.facts.files.map((f) => f.p),
  });
  const remember = (atlas) => {
    const lang = Object.entries(atlas.facts?.langs || {})
      .sort((a, b) => b[1] - a[1])
      .find(([l]) => !['HTML', 'CSS', 'Shell'].includes(l))?.[0];
    setProjects((ps) => [
      {
        key: atlas.key,
        name: atlas.name,
        kind: atlas.src.kind,
        full: atlas.src.full,
        root: atlas.src.root,
        lang,
        at: Date.now(),
      },
      ...ps.filter((p) => p.key !== atlas.key),
    ]);
  };
  const stoppers = useRef({});
  const stopReading = (key) => stoppers.current[key]?.();
  const narrate = (key, model = settings.model, firstErr = null) => {
    const atlas = atlasRef.current[key];
    if (!atlas?.facts) return;
    patchAtlas(key, { status: 'narrating', narr: emptyNarr(), error: null });
    const parser = ndjsonParser((block) => {
      patchAtlas(key, (a) => ({ narr: applyNarr(a.narr || emptyNarr(), block) }));
      if (block.t === 'term' && block.term)
        setProgress((prev) =>
          addWord(prev, {
            term: block.term,
            plain: block.plain,
            like: block.like,
            from: null,
            title: atlas.name,
          }),
        );
    });
    const prompt = buildAtlasPrompt(
      atlas.facts,
      atlas.meta,
      detectStack(atlas.facts),
      settings.level,
    );
    const finish = (status, error, stopped = false) => {
      parser.end();
      if (status === 'done' && !document.hasFocus()) {
        try {
          new Notification('Bento finished reading', {
            body: `${atlas.name} is ready to explore.`,
            silent: true,
          });
        } catch {}
      }
      setAtlases((prev) => {
        const updated = { ...prev[key], status, error };
        api.cachePut(key, {
          facts: updated.facts,
          meta: updated.meta,
          narr: updated.narr,
          src: updated.src,
          name: updated.name,
          done: status === 'done',
          stopped,
          at: Date.now(),
        });
        return { ...prev, [key]: updated };
      });
    };
    const onErr = (message) => {
      // this AI can't answer right now: try your other one once, before showing the first error
      const alt = altOf(model, getProviders());
      if (
        settings.autoFallback &&
        !firstErr &&
        alt &&
        /usage limit|isn’t signed in|isn’t installed|can’t talk to yet|doesn’t have Copilot|no longer lets personal|isn’t set up with a key|doesn’t offer|can’t use Gemini/.test(
          message,
        ) &&
        !atlasRef.current[key]?.narr?.gist
      ) {
        parser.end();
        return narrate(key, alt, message);
      }
      finish('narr-error', firstErr || message);
    };
    const cancel = api.ask(
      model,
      prompt,
      {
        chunk: (t) => parser.push(t),
        think: (t) => patchAtlas(key, { thinking: t }),
        done: () => finish('done', null),
        error: onErr,
      },
      'atlas',
    );
    stoppers.current[key] = () => {
      cancel?.();
      finish('narr-error', 'You stopped the reading. Press retry to continue.', true);
    };
  };
  /**
   * @param {any} src what to open: { kind: 'github', full } or { kind: 'local', root, name }
   * @param {{ quiet?: boolean, big?: boolean }} [opts]
   */
  const openAtlas = async (src, { quiet, big } = {}) => {
    const key = src.kind === 'github' ? src.full : `local:${src.root}`;
    const name = src.kind === 'github' ? src.full : src.name;
    if (!quiet) {
      setAtlasKey(key);
      setViewRaw('atlas');
    }
    const have = atlasRef.current[key];
    if (have?.facts) {
      setProjectRaw(asProject(have));
      if (!quiet && have.status === 'done-quiet') narrate(key);
      return have;
    }
    if (have && !have.error) return null; // already loading
    setAtlases((m) => ({ ...m, [key]: { key, name, src, status: 'cloning', progress: null } }));
    try {
      const cached = await api.cacheGet(key);
      if (cached?.facts && (await api.atlasReopen(cached.src.root))) {
        if (cached.facts.v !== ANALYSIS_VERSION) {
          try {
            cached.facts = await api.atlasAnalyze(cached.src.root, name);
            api.cachePut(key, { ...cached });
          } catch {}
        }
        const atlas = {
          key,
          name,
          src: cached.src,
          meta: cached.meta,
          facts: cached.facts,
          narr: cached.narr || emptyNarr(),
          status: cached.done ? 'done' : 'narr-error',
          error: cached.done
            ? null
            : cached.stopped
              ? 'You stopped the reading. Press retry to continue.'
              : 'The explanation stopped early.',
        };
        setAtlases((m) => ({ ...m, [key]: atlas }));
        atlasRef.current = { ...atlasRef.current, [key]: atlas };
        setProjectRaw(asProject(atlas));
        remember(atlas);
        // the app was closed before the reading wrote anything: just start it again instead of showing an error
        if (!cached.done && !cached.narr?.gist && !cached.stopped && !quiet)
          setTimeout(() => narrate(key), 0); // but never restart one you stopped yourself
        return atlas;
      }
      // featured projects ship already taken apart: show them now, fetch the code quietly for reading files
      const F0 = src.kind === 'github' && FEATURED[key];
      if (F0) {
        const atlas = {
          key,
          name,
          src: { kind: 'github', full: src.full, root: null },
          meta: F0.meta,
          facts: F0.facts,
          narr: F0.narr,
          status: 'done',
          featured: true,
        };
        setAtlases((m) => ({ ...m, [key]: atlas }));
        atlasRef.current = { ...atlasRef.current, [key]: atlas };
        api
          .atlasFetch(src.full)
          .then((s2) => {
            patchAtlas(key, { src: s2 });
            const A2 = { ...atlas, src: s2 };
            setProjectRaw(asProject(A2));
            remember(A2);
            api.cachePut(key, {
              facts: F0.facts,
              meta: F0.meta,
              narr: F0.narr,
              src: s2,
              name,
              done: true,
              at: Date.now(),
            });
          })
          .catch((e) => patchAtlas(key, { fetchError: cleanErr(e) }));
        return atlas;
      }
      const metaP =
        src.kind === 'github' ? api.atlasMeta(src.full).catch(() => null) : Promise.resolve(null);
      let s2 = src;
      // GitHub counts the whole history; Bento only downloads the latest version, usually a small part of that
      if (src.kind === 'github' && !big) {
        const m = await metaP;
        if (m?.size > 2500000) {
          patchAtlas(key, { status: 'big', meta: m });
          return null;
        }
      }
      if (src.kind === 'github') s2 = await api.atlasFetch(src.full);
      patchAtlas(key, { status: 'reading', src: s2 });
      const facts = await api.atlasAnalyze(s2.root, name);
      const meta = await metaP;
      const atlas = {
        key,
        name,
        src: s2,
        meta,
        facts,
        narr: emptyNarr(),
        status: quiet ? 'done-quiet' : 'narrating',
      };
      setAtlases((m) => ({ ...m, [key]: { ...m[key], ...atlas } }));
      atlasRef.current = { ...atlasRef.current, [key]: atlas };
      setProjectRaw(asProject(atlas));
      remember(atlas);
      api.cachePut(key, { facts, meta, narr: null, src: s2, name, done: false, at: Date.now() });
      if (!quiet) narrate(key);
      return atlas;
    } catch (e) {
      patchAtlas(key, { status: 'error', error: cleanErr(e) });
      return null;
    }
  };
  const openRepo = (full) => openAtlas({ kind: 'github', full });
  const openSite = async (url) => {
    let host;
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return;
    }
    const put = (p) =>
      setSites((m) => ({
        ...m,
        [host]: { ...m[host], ...(typeof p === 'function' ? p(m[host] || {}) : p) },
      }));
    setSiteKey(host);
    setViewRaw('site');
    if (sites[host]?.facts && sites[host].status !== 'error') return;
    put({ host, url, status: 'loading', facts: null, narr: emptyNarr(), error: null });
    const cached = await api.cacheGet(`site:${host}`).catch(() => null);
    if (cached?.facts && cached.narr) {
      put({ host, url, status: 'done', facts: cached.facts, narr: cached.narr });
      setProjects((ps) => [
        { key: `site:${host}`, name: host, kind: 'site', url, at: Date.now() },
        ...ps.filter((x) => x.key !== `site:${host}`),
      ]);
      return;
    }
    try {
      const facts = await api.siteInspect(url);
      put({ facts, status: 'narrating' });
      const found = detectSite(facts);
      const parser = ndjsonParser((block) => {
        put((x) => ({ narr: applyNarr(x.narr || emptyNarr(), block) }));
        if (block.t === 'term' && block.term)
          setProgress((prev) =>
            addWord(prev, {
              term: block.term,
              plain: block.plain,
              like: block.like,
              from: null,
              title: host,
            }),
          );
      });
      setProjects((ps) => [
        { key: `site:${host}`, name: host, kind: 'site', url, at: Date.now() },
        ...ps.filter((x) => x.key !== `site:${host}`),
      ]);
      api.ask(
        settings.model,
        buildSitePrompt(facts, found, settings.level),
        {
          chunk: (t) => parser.push(t),
          done: () => {
            parser.end();
            setSites((prev) => {
              const x = { ...prev[host], status: 'done' };
              api.cachePut(`site:${host}`, {
                facts: x.facts,
                narr: x.narr,
                url,
                host,
                at: Date.now(),
              });
              return { ...prev, [host]: x };
            });
          },
          error: (m) => {
            parser.end();
            put({ status: 'narr-error', error: m });
          },
        },
        'site',
      );
    } catch (e) {
      put({ status: 'error', error: cleanErr(e) });
    }
  };
  const [pendingFile, setPendingFile] = useState(null);
  const openRepoAt = (full, path) => {
    setPendingFile({ key: full, path });
    openRepo(full);
  };
  const findWild = async (lesson) => {
    const code = lesson.work ?? lesson.code ?? '';
    const py = lesson.lang === 'python';
    const fn = (
      py ? /^def\s+(\w+)/m : /^(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:\(|function|async))/m
    ).exec(code);
    const name = fn ? fn[1] || fn[2] : null;
    const question =
      name && name.length > 3 && !/^(main|show|draw|run|test|demo)$/.test(name)
        ? `${py ? 'def' : 'function'} ${name}`
        : (lesson.terms?.[0]?.term || lesson.concepts?.[0] || lesson.title).replace(/-/g, ' ');
    return api.ghCode(question, py ? 'python' : 'javascript');
  };
  const openFolderAtlas = async () => {
    const r = await api.openFolder();
    if (r) openAtlas({ kind: 'local', root: r.root, name: r.name });
  };
  const openProject = (p) =>
    p.kind === 'site'
      ? openSite(p.url)
      : p.kind === 'github'
        ? openRepo(p.full)
        : openAtlas({ kind: 'local', root: p.root, name: p.name });
  useEffect(() => api.onAtlasProgress?.((full, p) => patchAtlas(full, { progress: p })), []);
  useEffect(() => {
    api
      .atlasList?.()
      .then((list) =>
        setProjects((ps) => {
          const seen = new Set(ps.map((p) => p.key));
          return [...ps, ...list.filter((x) => !seen.has(x.key))].sort((a, b) => b.at - a.at);
        }),
      )
      .catch(() => {});
  }, []);
  const showAtlas = (key) => {
    const sp = projects.find((x) => x.key === key && x.kind === 'site');
    if (sp) return openSite(sp.url);
    setAtlasKey(key);
    setViewRaw('atlas');
    const project = projects.find((x) => x.key === key);
    if (!atlasRef.current[key]?.facts && project) openProject(project);
  };

  // feature mode on Home picks a project: bring it in quietly (no narration)
  const setProject = async (project) => {
    if (project === null) return setProjectRaw(null);
    if (project === 'folder') {
      const r = await api.openFolder();
      if (r) openAtlas({ kind: 'local', root: r.root, name: r.name }, { quiet: true });
      return;
    }
    if (project.repo) {
      setProjectRaw({ kind: 'github', name: project.repo, files: [], loading: true });
      const atlas = await openAtlas({ kind: 'github', full: project.repo }, { quiet: true });
      if (!atlas) setProjectRaw(null);
    }
  };

  const ensureProject = (key) => {
    const project = projects.find((x) => x.key === key);
    if (!project && FEATURED[key] && !atlasRef.current[key]?.facts) {
      openAtlas({ kind: 'github', full: key }, { quiet: true });
      return;
    }
    if (project && !atlasRef.current[key]?.facts)
      openAtlas(
        project.kind === 'github'
          ? { kind: 'github', full: project.full }
          : { kind: 'local', root: project.root, name: project.name },
        { quiet: true },
      );
  };
  // take a project apart again from scratch (after a refresh, a failed reading, or to read all of a big one)
  const reopenAtlas = (key, src, opts) => {
    setAtlases((m) => {
      const next = { ...m };
      delete next[key];
      atlasRef.current = next;
      return next;
    });
    setTimeout(() => openAtlas(src, opts), 0);
  };

  return {
    atlases,
    atlasKey,
    setAtlasKey,
    projects,
    setProjects,
    sites,
    setSites,
    siteKey,
    setSiteKey,
    stopReading,
    patchAtlas,
    asProject,
    narrate,
    openAtlas,
    reopenAtlas,
    openRepo,
    openRepoAt,
    openSite,
    openFolderAtlas,
    openProject,
    showAtlas,
    setProject,
    ensureProject,
    pendingFile,
    setPendingFile,
    findWild,
  };
}
