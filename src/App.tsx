import { useEffect, useState, type ChangeEvent } from 'react';
import { LangContext, initialLang, saveLang, strings, useT } from './i18n';
import { loadCase, loadManifest } from './data';
import { downloadJson, exportArchive, importArchive } from './storage';
import { isFinished, loadSession } from './testSession';
import { SlideViewer } from './SlideViewer';
import { TestPage } from './TestPage';
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
        ) : (
          <section className="home">
            <p>{strings.underConstruction[lang]}</p>
            <div className="home-actions">
              <button className="primary" onClick={() => navigate('/test')}>
                {testLabel}
              </button>
              <button onClick={() => navigate('/trial')}>{strings.trialViewer[lang]}</button>
            </div>
            <ArchivePanel />
          </section>
        )}
      </main>
      <footer>
        <p>{strings.disclaimer[lang]}</p>
        <p className="attribution">{strings.attribution[lang]}</p>
      </footer>
    </LangContext.Provider>
  );
}
