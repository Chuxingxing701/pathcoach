import { useContext, useEffect, useState, type ChangeEvent } from 'react';
import { LangContext, initialLang, saveLang, strings, useT } from './i18n';
import { loadCase, loadCasesBySplit, loadManifest } from './data';
import { downloadJson, exportArchive, importArchive } from './storage';
import { isFinished, loadSession } from './testSession';
import * as rs from './readingSession';
import { SlideViewer } from './SlideViewer';
import { TestPage } from './TestPage';
import { CasePage } from './CasePage';
import type { CaseMeta, Lang } from './types';

function TrialViewer({ lang }: { lang: Lang }) {
  const [slide, setSlide] = useState<CaseMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadManifest()
      .then((m) => loadCase(m.trial))
      .then(setSlide)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!slide) return <p>Loading…</p>;
  return (
    <>
      <p className="case-info">
        {slide.siteLabel[lang]} · H&amp;E · {slide.specimen}
      </p>
      <SlideViewer slide={slide} />
    </>
  );
}

function ArchivePanel() {
  const t = useT();
  const [msg, setMsg] = useState<string | null>(null);

  const onExport = () => downloadJson('pathcoach-archive.json', exportArchive());
  const onImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    file
      .text()
      .then((text) => {
        importArchive(JSON.parse(text));
        setMsg(t(strings.archiveImported));
      })
      .catch(() => setMsg(t(strings.archiveImportFailed)));
  };

  return (
    <div className="archive">
      <span className="archive-label">{t(strings.localData)}</span>
      <button onClick={onExport}>{t(strings.exportArchive)}</button>
      <label className="import-btn">
        {t(strings.importArchive)}
        <input type="file" accept="application/json" onChange={onImport} hidden />
      </label>
      {msg && <span className="archive-msg">{msg}</span>}
    </div>
  );
}

const LEVEL_NAMES: Record<string, { en: string; zh: string }> = {
  novice: { en: 'Novice', zh: '新手' },
  proficient: { en: 'Proficient', zh: '熟练' },
  expert: { en: 'Expert', zh: '专家' },
};

function Library({ go }: { go: (to: string) => void }) {
  const t = useT();
  const lang = useContext(LangContext);
  const [cases, setCases] = useState<CaseMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(rs.getLevel());
  const [suggestion] = useState(rs.levelSuggestion);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    loadCasesBySplit('practice')
      .then(setCases)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!cases) return <p>Loading…</p>;

  const stateOf = (id: string) => {
    const s = rs.load(id);
    if (!s) return 'none';
    if (!rs.isRevealed(s)) return 'reading';
    return s.correct === undefined ? 'done' : s.correct ? 'correct' : 'wrong';
  };

  return (
    <section className="library">
      <div className="lib-head">
        <h2>{t(strings.libTitle)}</h2>
        <div className="level-picker">
          <span className="control-label">{t(strings.levelLabel)}</span>
          {rs.LEVELS.map((id) => (
            <button
              key={id}
              className={level === id ? 'sel' : ''}
              onClick={() => {
                rs.setLevel(id);
                setLevel(id);
              }}
            >
              {LEVEL_NAMES[id]![lang]}
            </button>
          ))}
        </div>
      </div>
      {suggestion && !dismissed && (
        <div className="suggest">
          <span>
            {t(strings.suggestText).replace('{n}', `${suggestion.correct}/${suggestion.window}`)}
          </span>
          <button
            className="primary"
            onClick={() => {
              rs.setLevel(suggestion.suggested);
              setLevel(suggestion.suggested);
              setDismissed(true);
            }}
          >
            {LEVEL_NAMES[suggestion.suggested]![lang]}
          </button>
          <button
            onClick={() => {
              rs.dismissLevelSuggestion(suggestion.newestUpdatedAt);
              setDismissed(true);
            }}
          >
            {t(strings.dismiss)}
          </button>
        </div>
      )}
      <div className="cards">
        {cases.map((c) => {
          const st = stateOf(c.id);
          return (
            <button key={c.id} className={`card st-${st}`} onClick={() => go(`/case/${c.id}`)}>
              <span className="card-site">{c.siteLabel[lang]}</span>
              <span className="card-meta">
                H&amp;E · {c.specimen} · {c.id}
              </span>
              <span className={`card-state st-${st}`}>{t(strings[`st_${st}` as 'st_none'])}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (to: string) => {
    window.history.pushState(null, '', to);
    setPath(to);
  };
  const toggleLang = () => {
    const next = lang === 'en' ? 'zh' : 'en';
    saveLang(next);
    setLang(next);
  };

  const pretest = loadSession('pretest');
  const testLabel = !pretest
    ? strings.testEntry[lang]
    : isFinished(pretest)
      ? strings.testDoneEntry[lang]
      : strings.testResume[lang];

  const caseMatch = path.match(/^\/case\/([a-z0-9-]+)$/);

  return (
    <LangContext.Provider value={lang}>
      <header className="topbar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
        >
          PathCoach
        </a>
        <span className="tagline">{strings.tagline[lang]}</span>
        <button className="lang" onClick={toggleLang}>
          {lang === 'en' ? '中文' : 'EN'}
        </button>
      </header>
      <main>
        {path === '/trial' ? (
          <TrialViewer lang={lang} />
        ) : path === '/test' ? (
          <TestPage mode="pretest" goHome={() => navigate('/')} />
        ) : caseMatch ? (
          <CasePage key={caseMatch[1]!} caseId={caseMatch[1]!} goHome={() => navigate('/')} />
        ) : (
          <>
            <div className="home-actions">
              <button className="primary" onClick={() => navigate('/test')}>
                {testLabel}
              </button>
              <button onClick={() => navigate('/trial')}>{strings.trialViewer[lang]}</button>
            </div>
            <Library go={navigate} />
            <ArchivePanel />
          </>
        )}
      </main>
      <footer>
        <p>{strings.disclaimer[lang]}</p>
        <p>{strings.attribution[lang]}</p>
      </footer>
    </LangContext.Provider>
  );
}
