import { useContext, useEffect, useMemo, useState } from 'react';
import type OpenSeadragon from 'openseadragon';
import type {
  Annotation,
  CaseAnswer,
  CaseMeta,
  Diagnosis,
  ItemValue,
  Level,
  ReadingSession,
  Template,
  TemplateItem,
  TemplateStep,
} from './types';
import { loadAnswer, loadCase, loadTemplate } from './data';
import { SlideViewer, fitImagePoints, setMag } from './SlideViewer';
import { AnnotationOverlay, type DrawMode } from './AnnotationOverlay';
import { LangContext, strings, useT } from './i18n';
import { clinicalLine, DXES, DX_LABELS } from './caseUi';
import * as rs from './readingSession';

const LEVEL_LABELS: Record<Level, { en: string; zh: string }> = {
  novice: { en: 'Novice', zh: '新手' },
  proficient: { en: 'Proficient', zh: '熟练' },
  expert: { en: 'Expert', zh: '专家' },
};

const ANNO_TYPE_LABELS: Record<Annotation['type'], { en: string; zh: string }> = {
  point: { en: 'Point', zh: '点' },
  rect: { en: 'Rect', zh: '矩形' },
  polygon: { en: 'Polygon', zh: '多边形' },
};

const EXPERT_STEP0_KEY = 'expert';

export function CasePage({ caseId, goHome }: { caseId: string; goHome: () => void }) {
  const t = useT();
  const lang = useContext(LangContext);
  const [meta, setMeta] = useState<CaseMeta | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [session, setSession] = useState<ReadingSession | null>(null);
  const [answer, setAnswer] = useState<CaseAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<Level>(rs.getLevel());
  const [stepIdx, setStepIdx] = useState(0);
  const [viewer, setViewer] = useState<OpenSeadragon.Viewer | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>(null);
  const [drawItem, setDrawItem] = useState<string | null>(null);
  const [pick, setPick] = useState<Diagnosis | null>(null);

  // Load case + template, then open (or create) the reading session.
  useEffect(() => {
    let alive = true;
    loadCase(caseId)
      .then(async (m) => {
        const tpl = await loadTemplate(m.templateId);
        if (!alive) return;
        setMeta(m);
        setTemplate(tpl);
        setSession(rs.save(rs.getOrCreate(caseId, rs.getLevel())));
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [caseId]);

  // After the session is revealed, fetch the official answer (and only then).
  useEffect(() => {
    if (!session || !rs.isRevealed(session) || answer) return;
    loadAnswer(session.caseId)
      .then(setAnswer)
      .catch((e: Error) => setError(e.message));
  }, [session, answer]);

  const itemById = useMemo(() => {
    const map = new Map<string, TemplateItem>();
    for (const s of template?.steps ?? []) for (const it of s.items) map.set(it.id, it);
    return map;
  }, [template]);

  const upd = (fn: (s: ReadingSession) => ReadingSession) => setSession((s) => (s ? fn(s) : s));

  const changeLevel = (l: Level) => {
    setLevel(l);
    rs.setLevel(l);
    upd((s) => (rs.isRevealed(s) ? s : rs.save({ ...s, level: l })));
  };

  if (error) return <p className="error">{error}</p>;
  if (!meta || !template || !session) return <p>Loading…</p>;

  const revealed = rs.isRevealed(session);
  const steps = template.steps;
  const siteStep = steps.find((s) => s.kind === 'site');
  const showItems = (s: TemplateStep) => s.levels.includes(level);
  const step0Items = siteStep?.items ?? [];
  const step0Done =
    level === 'expert'
      ? Boolean(session.step0Answers[EXPERT_STEP0_KEY]?.trim())
      : step0Items.every((it) => Boolean(session.step0Answers[it.id]?.trim()));
  const unlocked = Boolean(session.unlocked) || step0Done;
  const step = steps[Math.min(stepIdx, steps.length - 1)]!;

  const submitConclusion = () => {
    if (!session || !pick) return;
    loadAnswer(session.caseId)
      .then((a) => {
        setAnswer(a);
        setSession(rs.conclude(session, pick, a.truth === pick));
      })
      .catch((e: Error) => setError(e.message));
  };

  /** Writes a step-0 answer; when the gate is complete, persists the unlock so a level switch can't re-lock it. */
  const setStep0AndUnlock = (itemId: string, text: string) =>
    upd((s) => {
      const n = rs.setStep0(s, itemId, text);
      if (n.unlocked) return n;
      const items = siteStep?.items ?? [];
      const done =
        level === 'expert'
          ? Boolean(n.step0Answers[EXPERT_STEP0_KEY]?.trim())
          : items.every((it) => Boolean(n.step0Answers[it.id]?.trim()));
      return done ? rs.save({ ...n, unlocked: true }) : n;
    });

  const armDraw = (mode: Exclude<DrawMode, null>, itemId: string | null) => {
    setDrawMode(mode);
    setDrawItem(itemId);
  };

  const itemLabel = (itemId: string | null) =>
    itemId ? (itemById.get(itemId)?.label[lang] ?? itemId) : t(strings.annoFree);
  const annoItemLabel = (a: Annotation) => itemLabel(a.itemId);

  const stepItem = (it: TemplateItem) => {
    const a = session.answers[it.id];
    const locked = revealed;
    return (
      <div className="item" key={it.id}>
        <div className="item-label">{it.label[lang]}</div>
        {level === 'novice' && it.hint && <p className="item-hint">{it.hint[lang]}</p>}
        {level === 'novice' && it.sources.length > 0 && (
          <p className="item-sources">
            {it.sources.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>
            ))}
          </p>
        )}
        <div className="item-ctl">
          {(['yes', 'no', 'unsure'] as ItemValue[]).map((v) => (
            <button
              key={v}
              disabled={locked}
              className={`tri ${a?.value === v ? `sel-${v}` : ''}`}
              onClick={() => upd((s) => rs.setItemAnswer(s, it.id, a?.value === v ? null : v))}
            >
              {t(strings[`ans_${v}` as 'ans_yes'])}
            </button>
          ))}
          <button
            className="annotate-btn"
            title={t(strings.annoForItem)}
            onClick={() => armDraw('point', it.id)}
          >
            {t(strings.annoMark)}
          </button>
        </div>
        <input
          className="item-note"
          placeholder={t(strings.itemNote)}
          disabled={locked}
          value={a?.note ?? ''}
          onChange={(e) =>
            upd((s) => rs.setItemAnswer(s, it.id, a?.value ?? 'unsure', e.target.value))
          }
        />
      </div>
    );
  };

  const step0Fields = (
    <>
      {level === 'expert' ? (
        <textarea
          className="step0-text"
          rows={6}
          placeholder={t(strings.step0ExpertHint)}
          disabled={revealed}
          value={session.step0Answers[EXPERT_STEP0_KEY] ?? ''}
          onChange={(e) => setStep0AndUnlock(EXPERT_STEP0_KEY, e.target.value)}
        />
      ) : (
        step0Items.map((it) => (
          <div className="step0-q" key={it.id}>
            <div className="item-label">{it.label[lang]}</div>
            {level === 'novice' && it.hint && <p className="item-hint">{it.hint[lang]}</p>}
            {level === 'novice' && it.options && (
              <p className="chips">
                {it.options.map((o) => (
                  <button
                    key={o.en}
                    className="chip"
                    disabled={revealed}
                    onClick={() => {
                      const cur = session.step0Answers[it.id] ?? '';
                      if (!cur.includes(o[lang])) {
                        setStep0AndUnlock(it.id, cur ? `${cur}；${o[lang]}` : o[lang]);
                      }
                    }}
                  >
                    {o[lang]}
                  </button>
                ))}
              </p>
            )}
            <textarea
              className="step0-text"
              rows={3}
              disabled={revealed}
              value={session.step0Answers[it.id] ?? ''}
              onChange={(e) => setStep0AndUnlock(it.id, e.target.value)}
            />
          </div>
        ))
      )}
    </>
  );

  const gate = (
    <div className="gate">
      <h3>{t(strings.step0Title)}</h3>
      <p className="gate-sub">{t(strings.step0Sub)}</p>
      {step0Fields}
    </div>
  );

  const conclusionBlock = (
    <div className="conclusion">
      {!revealed ? (
        <>
          {step.kind === 'conclusion' &&
            step.items.map((it) => (
              <p key={it.id} className="item-hint">
                · {it.label[lang]}
              </p>
            ))}
          <div className="item-ctl">
            {DXES.map(({ id, key }) => (
              <button key={id} className={pick === id ? 'sel' : ''} onClick={() => setPick(id)}>
                {t(strings[key])}
              </button>
            ))}
          </div>
          <p>
            <button className="primary" disabled={!pick} onClick={submitConclusion}>
              {t(strings.submitConclusion)}
            </button>
          </p>
        </>
      ) : !answer ? (
        <p>Loading…</p>
      ) : (
        <>
          <p className={`verdict ${answer.truth === session.conclusion ? 'ok' : 'bad'}`}>
            {answer.truth === session.conclusion ? t(strings.verdictOk) : t(strings.verdictBad)}
          </p>
          <p className="reveal-line">
            {t(strings.yourCall)}:{' '}
            <b>{session.conclusion ? DX_LABELS[session.conclusion][lang] : '–'}</b>
            {' · '}
            {t(strings.colTruth)}: <b>{DX_LABELS[answer.truth][lang]}</b>
          </p>
          <div className="reveal-src">
            <p>
              {t(strings.revealDx)}: {answer.primaryDiagnosis}
            </p>
            <p className="src-line">
              {answer.source.project} · {answer.source.sampleType} · {answer.source.submitterId} ·{' '}
              <a
                href={`https://portal.gdc.cancer.gov/files/${answer.source.gdcFileId}`}
                target="_blank"
                rel="noreferrer"
              >
                GDC
              </a>
            </p>
          </div>
        </>
      )}
    </div>
  );

  const annoList = (
    <div className="anno-panel">
      <div className="anno-tools">
        <span className="control-label">{t(strings.annoTitle)}</span>
        {drawItem && (
          <span className="anno-binding">
            {itemLabel(drawItem)}
            <button className="chip-x" onClick={() => setDrawItem(null)}>
              ×
            </button>
          </span>
        )}
        {(['point', 'rect', 'polygon'] as const).map((m) => (
          <button
            key={m}
            className={drawMode === m ? 'sel' : ''}
            onClick={() => (drawMode === m ? setDrawMode(null) : armDraw(m, drawItem))}
          >
            {ANNO_TYPE_LABELS[m][lang]}
          </button>
        ))}
        {drawMode && <button onClick={() => setDrawMode(null)}>{t(strings.annoCancel)}</button>}
        <span className="anno-hint">
          {drawMode === 'polygon'
            ? t(strings.annoPolyHint)
            : drawMode
              ? t(strings.annoDrawHint)
              : t(strings.annoArmHint)}
        </span>
      </div>
      {session.annotations.length > 0 && (
        <ul className="anno-list">
          {session.annotations.map((a, i) => (
            <li key={a.id}>
              <span className="anno-idx">{i + 1}</span>
              <span className="anno-meta">
                {ANNO_TYPE_LABELS[a.type][lang]} · {annoItemLabel(a)}
              </span>
              <input
                className="anno-note"
                placeholder={t(strings.itemNote)}
                value={a.note}
                onChange={(e) => upd((s) => rs.updateAnnotation(s, a.id, { note: e.target.value }))}
              />
              <button onClick={() => viewer && fitImagePoints(viewer, a.points)}>
                {t(strings.annoJump)}
              </button>
              <button onClick={() => upd((s) => rs.removeAnnotation(s, a.id))}>
                {t(strings.annoDelete)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="case">
      <aside className="steps">
        <button className="back-link" onClick={goHome}>
          ← {t(strings.back)}
        </button>
        <div className="level-picker">
          {rs.LEVELS.map((l) => (
            <button
              key={l}
              className={level === l ? 'sel' : ''}
              onClick={() => changeLevel(l)}
              title={t(strings[`level_${l}` as 'level_novice'])}
            >
              {LEVEL_LABELS[l][lang]}
            </button>
          ))}
        </div>
        <ol className="step-list">
          {steps.map((s, i) => {
            const lockedStep = !unlocked && i > 0;
            return (
              <li key={s.id}>
                <button
                  className={`step-btn ${i === stepIdx ? 'cur' : ''}`}
                  disabled={lockedStep}
                  onClick={() => setStepIdx(i)}
                >
                  {s.title[lang]}
                </button>
              </li>
            );
          })}
        </ol>
      </aside>
      <div className="case-main">
        <p className="case-info">{clinicalLine(meta, lang)}</p>
        {!unlocked ? (
          gate
        ) : (
          <>
            <SlideViewer slide={meta} onViewerReady={setViewer}>
              {viewer && (
                <AnnotationOverlay
                  viewer={viewer}
                  annotations={session.annotations}
                  drawMode={drawMode}
                  itemId={drawItem}
                  onCreate={(a) => {
                    const id =
                      globalThis.crypto?.randomUUID?.() ?? `a${Date.now()}${Math.random()}`;
                    upd((s) => rs.addAnnotation(s, { ...a, id }));
                  }}
                  onDrawEnd={() => setDrawMode(null)}
                />
              )}
            </SlideViewer>
            {annoList}
            <section className="step-panel">
              <h3>{step.title[lang]}</h3>
              {step.targetMag !== null && viewer && (
                <button onClick={() => setMag(viewer, meta.tiles.mpp, step.targetMag!)}>
                  {t(strings.goMag)} {step.targetMag}×
                </button>
              )}
              {step.kind === 'conclusion'
                ? conclusionBlock
                : step.kind === 'site'
                  ? step0Fields
                  : showItems(step)
                    ? step.items.map(stepItem)
                    : null}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
