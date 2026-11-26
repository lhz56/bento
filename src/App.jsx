import { useEffect, useMemo, useRef, useState } from 'react';

import { noAI } from './ai.js';
import { api } from './bridge.js';
import { useT, t } from './i18n.js';
import { SAMPLES, CHALLENGE, parseJSONLoose } from './lesson.js';
import { loadPacks, savePacks, validatePack, applyPacks } from './packs.js';
import { keys, TOUCH } from './platform.js';
import { addWord } from './progress.js';
import { PRE, loadPrebuilt } from './prebuilt.js'; // lessons that ship already written, loaded just after the first screen
import { SKILLS } from './skills.js';
import { load, save } from './store.js';
import { WEB } from './web.js';

import {
  useAgentBridge,
  useAtlasQuestions,
  useConnections,
  useDeepLinks,
  useExplanations,
  useFallbackNotice,
  useFileDrop,
  useLearningPath,
  useLessons,
  useLibrary,
  useNavigation,
  usePersistence,
  useProgressSummary,
  useQuestionRouting,
  useScriptHooks,
  useSettings,
  useShortcuts,
  useStarters,
  RACE_LESSONS,
  settle,
} from './hooks/index.js';

import AtlasScreen from './screens/AtlasScreen.jsx';
import LessonScreen from './screens/LessonScreen.jsx';

import Coach from './ui/Coach.jsx';
import Compare from './ui/Compare.jsx';
import Explore from './ui/Explore.jsx';
import FindBar from './ui/FindBar.jsx';
import Home from './ui/Home.jsx';
import Icon from './ui/Icons.jsx';
import Ideas from './ui/Ideas.jsx';
import KeySheet from './ui/KeySheet.jsx';
import Onboarding from './ui/Onboarding.jsx';
import Palette from './ui/Palette.jsx';
import Path from './ui/Path.jsx';
import { useNarrow, TopBar, TabBar, isRoot, noteScroll } from './ui/Phone.jsx';
import Playgrounds from './ui/Playgrounds.jsx';
import Puzzles from './ui/Puzzles.jsx';
import Settings from './ui/Settings.jsx';
import { Sidebar, modelLabel, groupOf, rememberTab } from './ui/Side.jsx';
import Site from './ui/Site.jsx';
import SkillMap from './ui/SkillMap.jsx';
import Words from './ui/Words.jsx';

// how much you learned each day (lessons + new words), for the activity grid on Home
const activityByDay = (ls, words = {}) => {
  const byDay = {};
  const add = (t) => {
    if (!t) return;
    const k = new Date(t).toDateString();
    byDay[k] = (byDay[k] || 0) + 1;
  };
  ls.forEach((l) => !l.builtin && l.status === 'done' && add(l.createdAt));
  Object.values(words).forEach((w) => add(w.at));
  return byDay;
};
// days in a row (ending today or yesterday) with at least one finished lesson
const streakOf = (ls) => {
  const days = new Set(
    ls
      .filter((l) => !l.builtin && l.status === 'done' && l.createdAt)
      .map((l) => new Date(l.createdAt).toDateString()),
  );
  let streak = 0;
  const date = new Date();
  if (!days.has(date.toDateString())) date.setDate(date.getDate() - 1);
  while (days.has(date.toDateString())) {
    streak++;
    date.setDate(date.getDate() - 1);
  }
  return streak;
};

export default function App() {
  const [lessons, setLessons] = useState(() => settle(load('bento.lessons', [])));
  const [view, setViewRaw] = useState('home');
  const { setSettings, setSettingsRaw, settings } = useSettings();
  const [progress, setProgress] = useState(() =>
    load('bento.progress', { concepts: {}, coins: 5 }),
  );
  const { providers, providersRef, pyReady, setProviders, user } = useConnections();
  const [repos, setRepos] = useState(null);
  const [project, setProjectRaw] = useState(null);
  useT(); // re-render when the interface's own words arrive in your language
  const [playTab, setPlayTab] = useState('sql');
  // content packs other people wrote: their puzzles, ideas and paths join the built-in ones
  const [packs, setPacksRaw] = useState(loadPacks);
  const setPacks = (fn) =>
    setPacksRaw((p) => {
      const n = typeof fn === 'function' ? fn(p) : fn;
      savePacks(n);
      return n;
    });
  const packStuff = useMemo(() => applyPacks(packs), [packs]);
  const [pal, setPal] = useState(false);
  // a phone: tabs at the bottom, Back at the top, and the sidebar slides over from the left (Phone.jsx)
  const phone = useNarrow();
  const [drawer, setDrawer] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [pane, setPane] = useState('story'); // a lesson on a phone: its story, or its code and what it does
  const [showSettings, setShowSettings] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const { fellBack, setFellBack } = useFallbackNotice();
  const [pair, setPair] = useState([null, null]);
  // a phone or iPad uses the Mac's AIs, which the Mac already set up: no welcome there
  // and on the web there's no AI to set up: straight in
  const [onb, setOnb] = useState(() =>
    WEB || api.remote || load('bento.settings', {}).onboarded ? null : 0,
  );
  const [pop, setPop] = useState(null);
  const [storyW, setStoryW] = useState(() => {
    const w = load('bento.storyW', 0.47);
    return w === 0.4 ? 0.47 : w;
  });
  // the sidebar can close (⌘\ or its button) to give the page the whole window
  const [sideOpen, setSideOpen] = useState(() => load('bento.side', true));
  useEffect(() => save('bento.side', sideOpen), [sideOpen]);
  const desk = useRef(null);
  const cancels = useRef(new Map());

  const lib = useLibrary({
    api,
    settings,
    setProgress,
    setProjectRaw,
    setViewRaw,
    getProviders: () => providersRef.current,
  });
  const {
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
  } = lib;
  const [preReady, setPreReady] = useState(PRE.ready);
  useEffect(() => {
    loadPrebuilt().then(
      () => setPreReady(true),
      () => {},
    );
  }, []);
  // Startup timing: the first screen is drawn and what was saved on disk has been read, so it's ready for input.
  // scripts/measure-startup.mjs reads "bento:interactive" (on the frame after both).
  useEffect(() => {
    performance.mark('bento:rendered');
    const disk = api.storeGet ? api.storeGet().catch(() => null) : Promise.resolve(null);
    disk.then(() =>
      requestAnimationFrame(() => setTimeout(() => performance.mark('bento:interactive'), 0)),
    );
  }, []);
  const { lessonsRef, restoreBackup, saveTrouble, setSaveTrouble } = usePersistence({
    cancels,
    lessons,
    progress,
    setLessons,
    setOnb,
    setProgress,
    setProjects,
    setSettingsRaw,
  });
  const knownWordSet = useMemo(() => new Set(Object.keys(progress.words || {})), [progress.words]);
  useEffect(() => save('bento.storyW', storyW), [storyW]);

  const {
    askLesson,
    award,
    current,
    currentId,
    linkRange,
    onPuzzleResult,
    openLesson,
    openPuzzle,
    openSim,
    patch,
    reopened,
    setCurrentId,
    setLinkRange,
    setPuzzleCode,
    setReopened,
    setStepSel,
    stepSel,
  } = useLessons({
    cancels,
    desk,
    lessons,
    lessonsRef,
    preReady,
    providersRef,
    setLessons,
    setPop,
    setProgress,
    setViewRaw,
    settings,
  });

  useDeepLinks({ askLesson, openRepo, openRepoAt, openSite });
  const { altFor, altModel, newScratch, openDaily, readIdea } = useStarters({
    askLesson,
    cancels,
    lessons,
    openLesson,
    progress,
    providers,
    setCurrentId,
    setLessons,
    setProgress,
    setStepSel,
    setViewRaw,
    settings,
  });
  const { goStop, makePath, pathOf, readyFor, startStop, trailBar } = useLearningPath({
    askLesson,
    lessons,
    openLesson,
    openSite,
    packStuff,
    progress,
    providers,
    readIdea,
    setPlayTab,
    setProgress,
    setViewRaw,
    settings,
    view,
  });
  useEffect(() => {
    rememberTab(view);
  }, [view]);
  const { builtins, mastery, readIds, skyDots, threads, today } = useProgressSummary({
    goStop,
    lessons,
    openDaily,
    openLesson,
    openProject,
    openPuzzle,
    openSim,
    packStuff,
    progress,
    projects,
    readIdea,
    setViewRaw,
    startStop,
  });
  const {
    atlasQ,
    buildContext,
    cancelFinding,
    choice,
    finding,
    goToProject,
    onAsk,
    recentProject,
    setAtlasQ,
    setChoice,
    setRecent,
  } = useQuestionRouting({
    askLesson,
    atlasKey,
    builtins,
    openAtlas,
    openProject,
    project,
    projects,
    view,
  });
  const setView = (v) => {
    if (v === 'bug') {
      openDaily();
      return;
    }
    setViewRaw(v);
  };

  const { explainSelection, onTerm, onTry, sel } = useExplanations({
    atlasKey,
    atlases,
    current,
    desk,
    phone,
    setPane,
    setPop,
    settings,
    view,
  });

  const { dropping } = useFileDrop({
    askLesson,
    openAtlas,
    setCurrentId,
    setLessons,
    setStepSel,
    setViewRaw,
    settings,
  });

  useShortcuts({
    desk,
    openFolderAtlas,
    setFindOpen,
    setLinkRange,
    setOnb,
    setPal,
    setPop,
    setShowKeys,
    setShowSettings,
    setSideOpen,
    setViewRaw,
    view,
  });

  const loadRepos = () => {
    if (repos === null && providers?.gh)
      api
        .ghRepos()
        .then(setRepos)
        .catch(() => setRepos([]));
    else if (!providers?.gh) setRepos([]);
  };

  const { goBack, page, phoneTitle } = useNavigation({
    atlasKey,
    atlases,
    current,
    currentId,
    drawer,
    phone,
    setAtlasKey,
    setCurrentId,
    setDrawer,
    setPane,
    setScrolled,
    setSiteKey,
    setView,
    setViewRaw,
    siteKey,
    view,
  });
  const [article, setArticle] = useState(() => !!localStorage.getItem('bento.article'));
  const [runs, setRuns] = useState({});
  const { noteFlash, runWaits } = useAgentBridge({
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
  });
  useScriptHooks({ askLesson, openLesson, readIdea });

  const { askRepo, compareAsk, openCompare } = useAtlasQuestions({
    askLesson,
    projects,
    setPair,
    setViewRaw,
  });

  const dragStory = (e) => {
    e.preventDefault();
    const main = e.currentTarget.parentElement.getBoundingClientRect();
    const mv = (ev) =>
      setStoryW(Math.min(0.6, Math.max(0.26, (ev.clientX - main.left) / main.width)));
    const up = () => {
      removeEventListener('mousemove', mv);
      removeEventListener('mouseup', up);
    };
    addEventListener('mousemove', mv);
    addEventListener('mouseup', up);
  };

  const streaming = current?.status === 'streaming';
  return (
    <div
      className={`app ${phone ? `phone ${drawer ? 'drawer-open' : ''} ${isRoot(view) ? 'at-root' : 'at-detail'}` : sideOpen ? '' : 'side-closed'}`}
    >
      {phone && (
        <TopBar
          view={view}
          title={phoneTitle}
          onBack={goBack}
          onMenu={() => setDrawer(true)}
          onSearch={() => setPal(true)}
          setView={setView}
          scrolled={scrolled}
          seg={
            view === 'lesson' &&
            current &&
            !(article && current.code && current.lang !== 'html' && !current.steps?.length)
              ? {
                  value: pane,
                  options: [
                    ['story', t('Lesson')],
                    ['code', current.lang === 'html' ? t('Page') : t('Code')],
                  ],
                  onChange: setPane,
                }
              : null
          }
        />
      )}
      {phone && (
        <div
          className={`pveil ${drawer ? 'on' : ''}`}
          onClick={() => setDrawer(false)}
          aria-hidden="true"
        />
      )}
      {saveTrouble && (
        <div className="save-trouble" role="alert">
          <b>
            {saveTrouble === 'ENOSPC'
              ? 'Your disk is full, so Bento can’t save.'
              : 'Bento can’t save your work right now.'}
          </b>
          <span>
            {saveTrouble === 'ENOSPC'
              ? 'Free up some space. Nothing is lost while Bento stays open, and it saves again by itself.'
              : 'Nothing is lost while Bento stays open. It keeps trying, and Settings → Back up… saves a copy anywhere you like.'}
          </span>
          <button className="ib" aria-label="Dismiss" onClick={() => setSaveTrouble(null)}>
            ✕
          </button>
        </div>
      )}
      <a
        className="skip"
        href="#content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('content')?.focus();
        }}
      >
        Skip to the main area
      </a>
      <Sidebar
        onClose={() => (phone ? setDrawer(false) : setSideOpen(false))}
        closed={phone ? !drawer : !sideOpen}
        view={view}
        setView={setView}
        lessons={lessons}
        current={currentId}
        onOpen={openLesson}
        onNew={() => setViewRaw('home')}
        projects={projects}
        atlasKey={view === 'atlas' ? atlasKey : null}
        atlases={atlases}
        onOpenProject={(p) => showAtlas(p.key)}
        onForgetProject={(k) => setProjects((ps) => ps.filter((p) => p.key !== k))}
        onDelete={(id) => {
          cancels.current.get(id)?.();
          setLessons((ls) => ls.filter((l) => l.id !== id));
          if (id === currentId) setViewRaw('home');
        }}
        settings={settings}
        setSettings={setSettings}
        providers={providers}
        user={user}
        progress={progress}
        onSetup={() => setOnb(1)}
        onSettings={() => {
          setShowSettings(true);
          setDrawer(false);
        }}
        siteKey={siteKey}
      />
      {/* (the tips point at a Mac's controls, often on the other side of a phone's Lesson | Code switch) */}
      {onb == null && !phone && view === 'lesson' && current && (
        <Coach
          key="lesson"
          screen="lesson"
          ready={!streaming && !!current.code && current.lang !== 'html'}
        />
      )}
      {onb == null && !phone && view === 'atlas' && (
        <Coach key="atlas" screen="atlas" ready={!!atlases[atlasKey]?.facts} />
      )}
      {dropping && (
        <div className="drop-veil">
          <div className="drop-card">
            <span>⤓</span>
            <b>Drop to take it apart</b>
            <i>
              A folder becomes a picture of the project. A code file gets explained line by line.
            </i>
          </div>
        </div>
      )}
      {showKeys && <KeySheet onClose={() => setShowKeys(false)} />}
      {fellBack && (
        <div className="fellback" role="status">
          {fellBack.from} couldn’t answer, so {fellBack.to} did (its plan pays).{' '}
          <button className="link small" onClick={() => setFellBack(null)}>
            OK
          </button>
        </div>
      )}
      {findOpen && <FindBar onClose={() => setFindOpen(false)} />}
      {showSettings && (
        <Settings
          settings={settings}
          setSettings={setSettings}
          providers={providers}
          onClose={() => setShowSettings(false)}
          onSetup={() => {
            setShowSettings(false);
            setOnb(1);
          }}
          onOpenData={() => api.openData?.()}
          packs={packs}
          onRemovePack={(id) => setPacks((ps) => ps.filter((p) => p.id !== id))}
          onAddPack={(json) => {
            const { errors, pack } = validatePack(json);
            if (errors.length) return { errors };
            setPacks((ps) => [...ps.filter((p) => p.id !== pack.id), pack]);
            return { pack };
          }}
          onBackup={() => api.backupSave?.()}
          onRestore={async () => {
            const d = await api.backupLoad?.();
            return d ? restoreBackup(d) : null;
          }}
          onReplayOnboarding={() => {
            setShowSettings(false);
            setOnb(0);
          }}
          wordsCount={Object.keys(progress.words || {}).length}
          lessonsCount={lessons.filter((l) => !l.builtin).length}
        />
      )}
      {pal && (
        <Palette
          onOpenAt={openRepoAt}
          onOpenSite={openSite}
          onClose={() => setPal(false)}
          lessons={lessons}
          projects={projects}
          words={progress.words || {}}
          actions={[
            ['home', 'Learn: ask anything', <Icon key="home" name="learn" size={15} />],
            ['path', 'Paths: learn it in order', <Icon key="path" name="path" size={15} />],
            ['explore', 'Explore code', <Icon key="explore" name="explore" size={15} />],
            ['ideas', 'Clever ideas', '⬡'],
            [
              'puzzles',
              'Puzzles: LeetCode, from the top down',
              <Icon key="puzzles" name="practice" size={15} />,
            ],
            ['play', 'Playgrounds: SQL, Git and the terminal, designing for a billion', '▦'],
            ['map', 'Your map: everything you know', '✺'],
            ['words', 'Your words', 'Aa'],
            ['bug', 'Daily bug', '⚑'],
          ]
            .map(([v, label, icon]) => ({ label, icon, run: () => setView(v) }))
            .concat([
              {
                label: 'Settings',
                icon: <Icon name="gear" size={15} />,
                run: () => setShowSettings(true),
              },
              { label: 'Keyboard shortcuts', icon: '?', run: () => setShowKeys(true) },
              {
                label: 'Connections & setup',
                icon: <Icon name="plus" size={15} />,
                run: () => setOnb(1),
              },
              {
                label: 'Open a folder on this Mac',
                icon: <Icon name="folder" size={15} />,
                run: openFolderAtlas,
              },
              { label: 'Compare two apps', icon: '⇄', run: () => openCompare() },
              { label: 'Scratchpad: write your own code', icon: '✎', run: () => newScratch() },
            ])
            .filter(
              (a) =>
                !(TOUCH && a.label === 'Keyboard shortcuts') &&
                !(api.remote && /^(Connections|Open a folder)/.test(a.label)),
            )}
          onAsk={(q) => onAsk(q, {})}
          onOpenRepo={openRepo}
          onLesson={openLesson}
          onProject={(p) => showAtlas(p.key)}
          onIdea={readIdea}
          onWord={() => setViewRaw('words')}
          builtins={builtins}
        />
      )}
      {onb != null && (
        <Onboarding
          api={api}
          settings={settings}
          setSettings={setSettings}
          startAt={onb}
          onDone={(go) => {
            setOnb(null);
            if (go === 'sample')
              openLesson(SAMPLES.find((lesson) => lesson.id === 'sample-spiral'));
            else if (['explore', 'ideas', 'path', 'puzzles'].includes(go)) setViewRaw(go);
            else setViewRaw('home');
            api
              .providers()
              .then(setProviders)
              .catch(() => setProviders({ scanFailed: true }));
          }}
        />
      )}
      <main
        className={`sheet ${groupOf(view)?.views.length > 1 && groupOf(view).views.some(([v]) => v === view) ? 'has-tabs' : ''}`}
        id="content"
        tabIndex={-1}
        onScrollCapture={
          phone
            ? (e) => {
                const y = e.target?.scrollTop || 0;
                if (y > 8 !== scrolled) setScrolled(y > 8);
                noteScroll(page, e.currentTarget, e.target);
              }
            : undefined
        }
      >
        <div className="titlebar-drag" />
        {!sideOpen && (
          <button
            className="side-open"
            onClick={() => setSideOpen(true)}
            aria-label={`${t('Show the sidebar')} (${keys('⌘\\')})`}
            title={`${t('Show the sidebar')}  ${keys('⌘\\')}`}
          >
            <Icon name="sidebar" size={17} />
          </button>
        )}
        {(() => {
          const group = groupOf(view);
          if (!group || group.views.length < 2 || !group.views.some(([v]) => v === view))
            return null;
          return (
            <div className="gtabs">
              <div className="gt-list" role="tablist" aria-label={t(group.label)}>
                {group.views.map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={view === id}
                    className={view === id ? 'on' : ''}
                    onClick={() => setView(id)}
                  >
                    {t(label)}
                  </button>
                ))}
              </div>
              {group.extra && (
                <>
                  <span className="gt-sep" aria-hidden="true" />
                  <button className="gt-extra" onClick={() => setView(group.extra[0])}>
                    ⚑ {t(group.extra[1])}
                    <span className="coins">
                      <i className="coin" />
                      {progress.coins ?? 5}
                    </span>
                  </button>
                </>
              )}
            </div>
          );
        })()}
        {view === 'home' && (
          <Home
            builtins={builtins}
            threads={threads}
            skyDots={skyDots}
            about={recentProject}
            onDropAbout={() => setRecent(null)}
            finding={finding}
            choice={choice}
            onChoose={(g) => {
              const c = choice;
              setChoice(null);
              if (!c) return;
              if (g) goToProject(c.q, { ...c.d, kind: 'go', why: 'chosen', pick: g });
              else askLesson(c.q, { ...c.o, noRoute: true });
            }}
            onCancelFinding={() => {
              const f = finding;
              cancelFinding();
              if (f) askLesson(f.q, {});
            }}
            today={today}
            onMap={() => setViewRaw('map')}
            lit={SKILLS.filter(([id]) => (mastery[id]?.level || 0) >= 2).length}
            onAsk={onAsk}
            settings={settings}
            setSettings={setSettings}
            project={project}
            setProject={setProject}
            onPickFolder={() => setProject('folder')}
            onPickRepo={(r) => setProject({ repo: r })}
            repos={repos}
            loadRepos={loadRepos}
            samples={SAMPLES}
            challenge={CHALLENGE}
            onOpen={openLesson}
            user={user}
            recent={lessons.filter((l) => !l.builtin)}
            providers={providers}
            onOpenRepo={openRepo}
            onExplore={() => setViewRaw('explore')}
            onIdea={readIdea}
            onScratch={() => newScratch()}
            onDaily={openDaily}
            onSim={openSim}
            onSetup={() => setOnb(1)}
            onSuggest={async (rs) => {
              const list = rs
                .slice(0, 25)
                .map(
                  (r) =>
                    `${r.name} (${r.primaryLanguage?.name || '?'})${r.description ? `: ${r.description.slice(0, 80)}` : ''}`,
                )
                .join('\n');
              const j = parseJSONLoose(
                await api.quick(
                  settings.model,
                  `A learner (${settings.level}) has these GitHub repos:\n${list}\n\nSuggest 3 short lessons that would most help THEM next, based on what they actually build (a gap, a next step, or a deeper look at a tool they use). Each lesson must be teachable with a small runnable example.\nReply JSON: {"items":[{"title":"≤ 6 words","why":"≤ 12 words, mention their project or tool","q":"the question to ask, ≤ 18 words","lang":"python|javascript|typescript"}]}`,
                ),
              );
              return (j?.items || []).slice(0, 3);
            }}
            onWords={() => setViewRaw('words')}
            words={progress.words || {}}
            stats={{
              days: activityByDay(lessons, progress.words),
              streak: streakOf(lessons),
              lessons: lessons.filter((l) => !l.builtin && l.status === 'done').length,
              ideas: Object.keys(readIds).length,
              words: Object.keys(progress.words || {}).length,
              apps: projects.length,
            }}
          />
        )}
        {view === 'compare' && (
          <Compare
            projects={projects.filter((x) => x.kind !== 'site')}
            atlases={atlases}
            ensure={ensureProject}
            pair={pair}
            setPair={setPair}
            onCompareAsk={compareAsk}
            onOpenProject={showAtlas}
          />
        )}
        {view === 'path' && (
          <Path
            custom={[...(progress.tracks || []), ...packStuff.paths]}
            onDropPath={(id) =>
              setProgress((p) => ({ ...p, tracks: (p.tracks || []).filter((t) => t.id !== id) }))
            }
            onMakePath={makePath}
            done={Object.fromEntries(
              Object.entries(progress.path || {})
                .filter(
                  ([, id]) => id === 'x' || lessons.some((l) => l.id === id && l.status === 'done'),
                )
                .map(([k]) => [k, true]),
            )}
            onGo={goStop}
            onIdeas={() => setViewRaw('ideas')}
          />
        )}
        {view === 'site' && sites[siteKey] && (
          <Site
            key={siteKey}
            site={sites[siteKey]}
            onOpenRepo={openRepo}
            modelLabel={modelLabel(settings.model)}
            onOpenUrl={(u) => api.openExternal(u)}
            onRetry={() => {
              const x = sites[siteKey];
              setSites((m) => {
                const n = { ...m };
                delete n[siteKey];
                return n;
              });
              setTimeout(() => openSite(x.url), 0);
            }}
            onAsk={(q) =>
              askLesson(
                `${q} (I'm studying the website ${siteKey}${sites[siteKey]?.narr?.gist?.one ? `: ${sites[siteKey].narr.gist.one}` : ''})`,
                {},
              )
            }
          />
        )}
        {view === 'ideas' && (
          <Ideas
            instant={!settings.voice || settings.voice === 'English' ? PRE.ideas : {}}
            races={[]}
            onRace={openLesson}
            onPuzzles={() => setViewRaw('puzzles')}
            extra={packStuff.ideas}
            onRead={readIdea}
            readIds={readIds}
            interests={settings.interests}
          />
        )}
        {view === 'play' && (
          <Playgrounds
            top={trailBar()}
            tab={playTab}
            setTab={setPlayTab}
            progress={progress}
            onProgress={(kind, id) =>
              setProgress((p) =>
                p[kind]?.[id] ? p : { ...p, [kind]: { ...(p[kind] || {}), [id]: Date.now() } },
              )
            }
            quick={noAI(providers) ? null : (m, q) => api.quick(m, q)}
            model={settings.model}
            pyReady={pyReady}
            onAsk={(q) => askLesson(q, {})}
          />
        )}
        {view === 'map' && (
          <SkillMap
            readyFor={readyFor}
            mastery={mastery}
            lessons={lessons}
            onAsk={(q) => askLesson(q, {})}
            onPuzzle={openPuzzle}
            onOpenLesson={(id) => {
              const l = lessons.find((x) => x.id === id);
              if (l) openLesson(l);
            }}
            quick={noAI(providers) ? null : (m, q) => api.quick(m, q)}
            model={settings.model}
            onReviewed={(ids, score = 0, total = 0) =>
              setProgress((prev) => ({
                ...prev,
                reviewed: {
                  ...(prev.reviewed || {}),
                  ...Object.fromEntries(ids.map((id) => [id, Date.now()])),
                },
                reviewScores: {
                  ...(prev.reviewScores || {}),
                  ...Object.fromEntries(
                    ids.map((id) => {
                      const old = prev.reviewScores?.[id] || { right: 0, total: 0 };
                      return [
                        id,
                        {
                          right: old.right + (ids.length === 1 ? score : Math.min(score, 1)),
                          total: old.total + total,
                          at: Date.now(),
                        },
                      ];
                    }),
                  ),
                },
              }))
            }
          />
        )}
        {view === 'puzzles' && (
          <Puzzles
            races={RACE_LESSONS}
            onRace={openLesson}
            progress={progress}
            onOpen={openPuzzle}
            onIdeas={() => setViewRaw('ideas')}
            onIdea={readIdea}
          />
        )}
        {view === 'words' && (
          <Words
            onAdd={(w) => setProgress((prev) => addWord(prev, w))}
            onGrade={(term, g) =>
              setProgress((p) => {
                const k = String(term).toLowerCase();
                return { ...p, words: { ...p.words, [k]: { ...p.words[k], ...g } } };
              })
            }
            words={progress.words || {}}
            onOpen={(id) => {
              const l = lessons.find((x) => x.id === id);
              if (l) openLesson(l);
            }}
            onAsk={(t) => askLesson(`Explain "${t}" with a tiny example`, {})}
          />
        )}
        {view === 'explore' && (
          <Explore
            top={trailBar()}
            api={api}
            onOpenAt={openRepoAt}
            onOpenSite={openSite}
            onCompare={() => openCompare()}
            onOpenRepo={openRepo}
            onOpenFolder={openFolderAtlas}
            projects={projects}
            onOpenProject={openProject}
            repos={repos}
            loadRepos={loadRepos}
            user={user}
            onConnectGitHub={api.remote ? null : () => setOnb(1)}
          />
        )}
        {view === 'atlas' && atlases[atlasKey] && (
          <AtlasScreen
            {...{
              api,
              asProject,
              askLesson,
              askRepo,
              atlasKey,
              atlasQ,
              atlases,
              buildContext,
              makePath,
              narrate,
              reopenAtlas,
              openCompare,
              pendingFile,
              phone,
              providers,
              setAtlasQ,
              setPendingFile,
              setViewRaw,
              settings,
              stopReading,
            }}
          />
        )}
        {view === 'lesson' && current && (
          <LessonScreen
            {...{
              altFor,
              altModel,
              api,
              article,
              askLesson,
              award,
              cancels,
              current,
              desk,
              dragStory,
              findWild,
              goStop,
              knownWordSet,
              linkRange,
              newScratch,
              noteFlash,
              onPuzzleResult,
              onTerm,
              onTry,
              openRepo,
              openRepoAt,
              pane,
              patch,
              pathOf,
              phone,
              progress,
              providers,
              pyReady,
              readIdea,
              reopened,
              runWaits,
              runs,
              setArticle,
              setLessons,
              setLinkRange,
              setPane,
              setProgress,
              setPuzzleCode,
              setReopened,
              setRuns,
              setSettings,
              setStepSel,
              setViewRaw,
              settings,
              showAtlas,
              stepSel,
              storyW,
              streaming,
            }}
          />
        )}
        {sel && !pop && (
          <button
            className="sel-pill"
            style={{ left: sel.x, top: Math.max(8, sel.y - 40) }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={explainSelection}
          >
            <span>✦</span>Explain
          </button>
        )}
        {pop && (
          <div
            className="pop tok-card big"
            style={{
              left: Math.min(pop.x, innerWidth - 340),
              top: Math.min(pop.y, innerHeight - 220),
            }}
          >
            {pop.loading ? (
              <>
                <div className="tok-head">
                  <span className="tok-word">{pop.kind === 'try' ? 'Trying it…' : pop.word}</span>
                  <span className="tok-kind">{pop.kind === 'try' ? pop.word : 'asking…'}</span>
                </div>
                <div className="shimmer" />
                <div className="shimmer short" />
              </>
            ) : (
              pop.info && (
                <>
                  <div className="tok-head">
                    <span className={`tok-word ${pop.info.t === 'explained' ? 'phrase' : ''}`}>
                      {pop.info.title}
                    </span>
                    <span className="tok-kind">{pop.info.t}</span>
                  </div>
                  {pop.info.w && <div className="tok-what">{pop.info.w}</div>}
                  {pop.info.p && (
                    <div className="tok-plain">
                      <span className="tok-plain-k">here</span>
                      <span>{pop.info.p}</span>
                    </div>
                  )}
                  {pop.info.ex && <pre className="tok-ex">{pop.info.ex}</pre>}
                </>
              )
            )}
          </div>
        )}
      </main>
      {phone && (
        <TabBar
          away={!isRoot(view)}
          view={view}
          setView={setView}
          onTop={() =>
            document.querySelectorAll('#content *').forEach((el) => {
              if (el.scrollTop > 0) el.scrollTo({ top: 0, behavior: 'smooth' });
            })
          }
        />
      )}
    </div>
  );
}
