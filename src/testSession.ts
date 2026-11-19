import type { Diagnosis, TestResult } from './types';
import * as store from './storage';

export type TestMode = 'pretest' | 'posttest';

/**
 * One-shot test session. Persisted under `test.<mode>` so a refresh mid-test
 * resumes instead of restarting. There is intentionally no reset path in the UI:
 * the test is a single irreversible baseline measurement (see ADR-007).
 */
export interface TestSession {
  mode: TestMode;
  /** Case IDs shuffled once at start; persisted so refresh keeps the order. */
  order: string[];
  index: number;
  results: TestResult[];
  startedAt: string;
  finishedAt: string | null;
  /** Time already accumulated on the current case across pauses/reloads. */
  carryMs: number;
  /** Wall-clock timestamp at which the current timing segment began. */
  segmentStartedAt: number;
}

const key = (mode: TestMode) => `test.${mode}`;

export function loadSession(mode: TestMode): TestSession | null {
  const s = store.load<TestSession>(key(mode));
  return s && s.mode === mode && Array.isArray(s.order) ? s : null;
}

function shuffle(ids: string[]): string[] {
  const a = [...ids];
  const rand = new Uint32Array(a.length);
  crypto.getRandomValues(rand);
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand[i]! % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function startSession(mode: TestMode, caseIds: string[]): TestSession {
  const session: TestSession = {
    mode,
    order: shuffle(caseIds),
    index: 0,
    results: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    carryMs: 0,
    segmentStartedAt: Date.now(),
  };
  store.save(key(mode), session);
  return session;
}

export const isFinished = (s: TestSession) => s.finishedAt !== null;

export function currentCaseId(s: TestSession): string | null {
  return isFinished(s) ? null : (s.order[s.index] ?? null);
}

/** Elapsed ms on the current case (previous segments + live segment). */
export function caseElapsed(s: TestSession, now = Date.now()): number {
  return s.carryMs + (isFinished(s) ? 0 : now - s.segmentStartedAt);
}

/**
 * Fold the live segment into `carryMs` and persist. Called on unmount and by the
 * UI's periodic tick so a crash mid-case loses at most a few seconds of timing.
 */
export function checkpoint(s: TestSession, now = Date.now()): TestSession {
  if (isFinished(s)) return s;
  const next = { ...s, carryMs: s.carryMs + (now - s.segmentStartedAt), segmentStartedAt: now };
  store.save(key(s.mode), next);
  return next;
}

export function submitAnswer(
  s: TestSession,
  answer: Diagnosis,
  confidence: TestResult['confidence'],
  now = Date.now(),
): TestSession {
  const caseId = currentCaseId(s);
  if (!caseId) return s;
  const result: TestResult = {
    mode: s.mode,
    caseId,
    answer,
    confidence,
    durationMs: s.carryMs + (now - s.segmentStartedAt),
    answeredAt: new Date(now).toISOString(),
  };
  const last = s.index + 1 >= s.order.length;
  const next: TestSession = {
    ...s,
    results: [...s.results, result],
    index: s.index + 1,
    carryMs: 0,
    segmentStartedAt: now,
    finishedAt: last ? new Date(now).toISOString() : null,
  };
  store.save(key(s.mode), next);
  return next;
}
