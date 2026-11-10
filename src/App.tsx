import { useEffect, useState } from 'react';
import { LangContext, initialLang, saveLang, strings } from './i18n';
import { loadCase, loadManifest } from './data';
import { SlideViewer } from './SlideViewer';
import type { CaseMeta, Lang } from './types';

function TrialViewer({ lang }: { lang: Lang }) {
  const [slide, setSlide] = useState<CaseMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadManifest()
      .then(async (m) => {
        const cases = await Promise.all(m.cases.map(loadCase));
        const trial = cases.find((c) => c.split === 'trial');
        if (!trial) throw new Error('no trial case');
        setSlide(trial);
      })
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
        ) : (
          <section className="home">
            <p>{strings.underConstruction[lang]}</p>
            <button onClick={() => navigate('/trial')}>{strings.trialViewer[lang]}</button>
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
