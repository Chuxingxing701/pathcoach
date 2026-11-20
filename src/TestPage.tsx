import { useContext, useEffect, useRef, useState } from 'react';
import type { CaseAnswer, CaseMeta, Diagnosis } from './types';
import { loadAnswer, loadCase, loadCasesBySplit } from './data';
import { SlideViewer } from './SlideViewer';
import { LangContext, strings, useT } from './i18n';
import { downloadJson } from './storage';
import * as ts from './testSession';
import type { TestMode, TestSession } from './testSession';

function fmtMs(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function clinicalLine(c: CaseMeta, lang: 'en' | 'zh'): string {
  const sex = c.clinical.sex === 'male' ? 'male' : c.clinical.sex === 'female' ? 'female' : null;
  const smoking =
    c.clinical.packYears !== null
      ? lang === 'en'
        ? `${c.clinical.packYears} pack-years`
        : `${c.clinical.packYears} 包年`
      : c.clinical.smoking === null
        ? lang === 'en'
          ? 'smoking unknown'
          : '吸烟史未知'
        : ({
            'current smoker': { en: 'current smoker', zh: '现在吸烟' },
            'lifelong non-smoker': { en: 'lifelong non-smoker', zh: '从不吸烟' },
            'reformed smoker (<=15 y)': { en: 'quit ≤15 y ago', zh: '戒烟 ≤15 年' },
            'reformed smoker (>15 y)': { en: 'quit >15 y ago', zh: '戒烟 >15 年' },
          }[c.clinical.smoking]?.[lang] ?? c.clinical.smoking);
  const parts = [
    c.siteLabel[lang],
    c.clinical.age !== null
      ? lang === 'en'
        ? `age ${c.clinical.age}`
        : `${c.clinical.age} 岁`
      : null,
    sex === null ? null : lang === 'en' ? sex : sex === 'male' ? '男' : '女',
    smoking,
    'H&E',
    c.specimen === 'frozen' ? (lang === 'en' ? 'frozen' : '冰冻') : 'FFPE',
  ];
  return parts.filter(Boolean).join(' · ');
}

const DXES: { id: Diagnosis; key: 'dxNormal' | 'dxAdeno' | 'dxSquamous' }[] = [
  { id: 'normal', key: 'dxNormal' },
  { id: 'adeno', key: 'dxAdeno' },
  { id: 'squamous', key: 'dxSquamous' },
];

export function TestPage({ mode, goHome }: { mode: TestMode; goHome: () => void }) {
  const t = useT();
  const lang = useContext(LangContext);
  const [session, setSession] = useState<TestSession | null>(null);
  const [metas, setMetas] = useState<Map<string, CaseMeta> | null>(null);
  const [answers, setAnswers] = useState<Map<string, CaseAnswer> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<{ dx: Diagnosis | null; conf: 1 | 2 | 3 | null }>({
    dx: null,
    conf: null,
  });
  const [elapsed, setElapsed] = useState(0);
  const sessionRef = useRef<TestSession | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Resume a persisted session, or load the split's case list for a fresh start.
  useEffect(() => {
    let alive = true;
    const existing = ts.loadSession(mode);
    const loader = existing ? Promise.all(existing.order.map(loadCase)) : loadCasesBySplit(mode);
    loader
      .then((list) => {
        if (!alive) return;
        setMetas(new Map(list.map((m) => [m.id, m])));
        if (existing) setSession(existing);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [mode]);

  // Answers reveal the label: fetch only once the whole test is finished.
  useEffect(() => {
    if (!session || !ts.isFinished(session) || answers) return;
    Promise.all(
      session.results.map((r) => loadAnswer(r.caseId).then((a) => [r.caseId, a] as const)),
    )
      .then((entries) => setAnswers(new Map(entries)))
      .catch((e: Error) => setError(e.message));
  }, [session, answers]);

  const running = session !== null && !ts.isFinished(session);

  // Display timer (1 s) + periodic checkpoint so a crash loses only seconds.
  useEffect(() => {
    if (!running) return;
    let n = 0;
    const iv = setInterval(() => {
      const s = sessionRef.current;
      if (!s) return;
      setElapsed(ts.caseElapsed(s));
      if (++n % 5 === 0) setSession((cur) => (cur ? ts.checkpoint(cur) : cur));
    }, 1000);
    return () => clearInterval(iv);
  }, [running]);

  // Persist elapsed time when the page is left mid-case.
  useEffect(
    () => () => {
      const s = sessionRef.current;
      if (s && !ts.isFinished(s)) ts.checkpoint(s);
    },
    [],
  );

  const start = () => {
    if (metas) setSession(ts.startSession(mode, [...metas.keys()]));
  };

  const submit = () => {
    const s = sessionRef.current;
    if (!s || !pick.dx || !pick.conf) return;
    setSession(ts.submitAnswer(s, pick.dx, pick.conf));
    setPick({ dx: null, conf: null });
    setElapsed(0);
  };

  if (error) return <p className="error">{error}</p>;
  if (!metas) return <p>Loading…</p>;

  if (!session) {
    return (
      <section className="test-intro">
        <h2>{t(strings.testTitle)}</h2>
        <ul>
          {strings.testBullets[lang].map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <p>
          <button className="primary" onClick={start}>
            {t(strings.startTest)}
          </button>
        </p>
      </section>
    );
  }

  if (ts.isFinished(session)) {
    const rows = session.results;
    const totalMs = rows.reduce((a, r) => a + r.durationMs, 0);
    const correct = answers
      ? rows.filter((r) => answers.get(r.caseId)?.truth === r.answer).length
      : null;
    const exportPayload = () => ({
      mode,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
      totalMs,
      score: correct === null ? null : `${correct}/${rows.length}`,
      results: rows.map((r) => {
        const truth = answers?.get(r.caseId)?.truth ?? null;
        return { ...r, truth, correct: truth === null ? null : truth === r.answer };
      }),
    });
    return (
      <section className="test-results">
        <h2>{t(strings.testDone)}</h2>
        <p className="locked">{t(strings.testLocked)}</p>
        {correct === null ? (
          <p>Loading…</p>
        ) : (
          <>
            <p className="score">
              {t(strings.score)}: {correct} / {rows.length} · {t(strings.totalTime)}{' '}
              {fmtMs(totalMs)}
            </p>
            <table className="result-table">
              <thead>
                <tr>
                  <th>{t(strings.colSlide)}</th>
                  <th>{t(strings.yourCall)}</th>
                  <th>{t(strings.colTruth)}</th>
                  <th>{t(strings.confidence)}</th>
                  <th>{t(strings.colTime)}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const truth = answers?.get(r.caseId)?.truth ?? null;
                  const ok = truth === r.answer;
                  const dxText = (d: Diagnosis | null) =>
                    d === null ? '–' : t(strings[DXES.find((x) => x.id === d)!.key]);
                  return (
                    <tr key={r.caseId} className={ok ? 'ok' : 'bad'}>
                      <td>{r.caseId}</td>
                      <td>{dxText(r.answer)}</td>
                      <td>{dxText(truth)}</td>
                      <td>{r.confidence}</td>
                      <td>{fmtMs(r.durationMs)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
        <p className="result-actions">
          <button
            disabled={answers === null}
            onClick={() => downloadJson(`pathcoach-${mode}-results.json`, exportPayload())}
          >
            {t(strings.exportResults)}
          </button>
          <button onClick={goHome}>{t(strings.backHome)}</button>
        </p>
      </section>
    );
  }

  const cid = ts.currentCaseId(session);
  const meta = cid ? metas.get(cid) : undefined;
  if (!meta) return <p>Loading…</p>;
  const last = session.index + 1 >= session.order.length;
  const confStr = [strings.confLow, strings.confMed, strings.confHigh];

  return (
    <div className="test">
      <div className="test-head">
        <span>
          {lang === 'en'
            ? `Slide ${session.index + 1} of ${session.order.length}`
            : `第 ${session.index + 1} / ${session.order.length} 张`}
        </span>
        <span className="test-timer" title={t(strings.colTime)}>
          {fmtMs(elapsed)}
        </span>
      </div>
      <p className="case-info">{clinicalLine(meta, lang)}</p>
      <SlideViewer slide={meta} />
      <div className="test-controls">
        <div className="control-group">
          <span className="control-label">{t(strings.yourCall)}</span>
          {DXES.map(({ id, key }) => (
            <button
              key={id}
              className={pick.dx === id ? 'sel' : ''}
              onClick={() => setPick((p) => ({ ...p, dx: id }))}
            >
              {t(strings[key])}
            </button>
          ))}
        </div>
        <div className="control-group">
          <span className="control-label">{t(strings.confidence)}</span>
          {([1, 2, 3] as const).map((c) => (
            <button
              key={c}
              className={pick.conf === c ? 'sel' : ''}
              onClick={() => setPick((p) => ({ ...p, conf: c }))}
            >
              {t(confStr[c - 1]!)}
            </button>
          ))}
        </div>
        <button className="primary" disabled={!pick.dx || !pick.conf} onClick={submit}>
          {last ? t(strings.submitLast) : t(strings.submitNext)}
        </button>
      </div>
    </div>
  );
}
