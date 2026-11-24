import type { Annotation, Diagnosis, ItemValue, Level, ReadingSession } from './types';
import * as store from './storage';

/**
 * Per-case guided-reading session (F3/F4/F5). Persisted under
 * `pathcoach.session.<caseId>` so a refresh or leaving the page resumes the
 * reading. Unlike the one-shot test session, revisiting a practice case is
 * expected; a session is considered complete once `revealedAt` is set.
 */

const key = (caseId: string) => `session.${caseId}`;
const LEVEL_KEY = 'level';
const LEVEL_DISMISSED_KEY = 'levelDismissedAt';

export const LEVELS: Level[] = ['novice', 'proficient', 'expert'];

export function load(caseId: string): ReadingSession | null {
  const s = store.load<ReadingSession>(key(caseId));
  return s && s.caseId === caseId ? s : null;
}

export function save(s: ReadingSession): ReadingSession {
  const next = { ...s, updatedAt: new Date().toISOString() };
  store.save(key(s.caseId), next);
  return next;
}

/**
 * caseIds whose slide was swapped before the dzi fingerprint existed. Any
 * fingerprint-less session for these was recorded against the old slide and
 * is treated as stale (other legacy sessions get stamped, they were recorded
 * against the current slide).
 */
const PRE_FINGERPRINT_SWAPS = new Set(['other-01']);

export function getOrCreate(caseId: string, level: Level, dzi: string): ReadingSession {
  const existing = load(caseId);
  // A defined-but-different fingerprint means the slide was swapped after the
  // session was recorded: the old answers are against different pixels, drop them.
  const stale =
    existing &&
    (PRE_FINGERPRINT_SWAPS.has(caseId)
      ? existing.dzi !== dzi
      : Boolean(existing.dzi && existing.dzi !== dzi));
  if (stale) {
    store.remove(key(caseId));
    return create();
  }
  return existing ? { ...existing, dzi } : create();
  function create(): ReadingSession {
    return {
      caseId,
      dzi,
      level,
      step0Answers: {},
      answers: {},
      annotations: [],
      conclusion: null,
      revealedAt: null,
      updatedAt: new Date().toISOString(),
    };
  }
}

export function setStep0(s: ReadingSession, itemId: string, text: string): ReadingSession {
  return save({ ...s, step0Answers: { ...s.step0Answers, [itemId]: text } });
}

export function setItemAnswer(
  s: ReadingSession,
  itemId: string,
  value: ItemValue | null,
  note?: string,
): ReadingSession {
  const answers = { ...s.answers };
  if (value === null && !note) delete answers[itemId];
  else answers[itemId] = { value: value ?? 'unsure', note: note ?? answers[itemId]?.note ?? '' };
  return save({ ...s, answers });
}

export function addAnnotation(s: ReadingSession, a: Annotation): ReadingSession {
  return save({ ...s, annotations: [...s.annotations, a] });
}

export function updateAnnotation(
  s: ReadingSession,
  id: string,
  patch: Partial<Pick<Annotation, 'itemId' | 'note'>>,
): ReadingSession {
  return save({
    ...s,
    annotations: s.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)),
  });
}

export function removeAnnotation(s: ReadingSession, id: string): ReadingSession {
  return save({ ...s, annotations: s.annotations.filter((a) => a.id !== id) });
}

/** Locks the conclusion and stamps the reveal; `correct` comes from the answer check. */
export function conclude(
  s: ReadingSession,
  conclusion: Diagnosis,
  correct: boolean,
): ReadingSession {
  return save({ ...s, conclusion, revealedAt: new Date().toISOString(), correct });
}

export const isRevealed = (s: ReadingSession) => s.revealedAt !== null;

/** Every stored session, newest first. */
export function allSessions(): ReadingSession[] {
  return store
    .archiveKeys()
    .filter((k) => k.startsWith('session.'))
    .map((k) => store.load<ReadingSession>(k))
    .filter((s): s is ReadingSession => s !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getLevel(): Level {
  const l = store.load<Level>(LEVEL_KEY);
  return l && LEVELS.includes(l) ? l : 'novice';
}

export function setLevel(level: Level): void {
  store.save(LEVEL_KEY, level);
}

export function dismissLevelSuggestion(newestUpdatedAt: string): void {
  store.save(LEVEL_DISMISSED_KEY, newestUpdatedAt);
}

export interface LevelSuggestion {
  current: Level;
  suggested: Level;
  correct: number;
  window: number;
  /** updatedAt of the newest session in the window — used for dismiss/re-surface. */
  newestUpdatedAt: string;
}

/**
 * Spec: when ≥5 of the last 6 completed readings are correct, suggest moving up
 * one level (never forced). Returns null when the suggestion doesn't apply or
 * was already dismissed for this window.
 */
export function levelSuggestion(): LevelSuggestion | null {
  const done = allSessions().filter((s) => s.revealedAt && s.correct !== undefined);
  const window = done.slice(0, 6);
  if (window.length < 6) return null;
  const correct = window.filter((s) => s.correct).length;
  if (correct < 5) return null;
  const current = getLevel();
  const idx = LEVELS.indexOf(current);
  if (idx >= LEVELS.length - 1) return null;
  const newestUpdatedAt = window[0]!.updatedAt;
  if (store.load<string>(LEVEL_DISMISSED_KEY) === newestUpdatedAt) return null;
  return { current, suggested: LEVELS[idx + 1]!, correct, window: window.length, newestUpdatedAt };
}
