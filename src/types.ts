export type Lang = 'en' | 'zh';
export type I18nText = Record<Lang, string>;

export type Split = 'practice' | 'pretest' | 'posttest' | 'trial';
export type Diagnosis = 'normal' | 'adeno' | 'squamous';
export type Level = 'novice' | 'proficient' | 'expert';

export interface Source {
  title: string;
  url: string;
}

/** Public metadata of a case. Never contains the diagnosis (see docs/decisions.md ADR-004). */
export interface CaseMeta {
  id: string;
  split: Split;
  site: string;
  siteLabel: I18nText;
  clinical: {
    age: number | null;
    sex: 'male' | 'female' | null;
    smoking: string | null;
    packYears: number | null;
  };
  stain: 'HE';
  specimen: 'FFPE' | 'frozen';
  templateId: string;
  tiles: {
    dzi: string;
    mpp: number;
    width: number;
    height: number;
    scanMag: number;
  };
  regions: string | null;
  source: {
    project: string;
    gdcFileId: string;
    fileName: string;
    submitterId: string;
    sampleType: string;
  };
}

/** Loaded only after the user submits a conclusion. */
export interface CaseAnswer {
  id: string;
  truth: Diagnosis;
  primaryDiagnosis: string;
}

export interface Manifest {
  version: number;
  cases: string[];
}

export interface TemplateItem {
  id: string;
  label: I18nText;
  hint?: I18nText;
  sources: Source[];
  atlas?: string[];
}

export type StepKind = 'site' | 'tissue' | 'stain' | 'pre-assessment' | 'features' | 'conclusion';

export interface TemplateStep {
  id: string;
  kind: StepKind;
  targetMag: number | null;
  title: I18nText;
  /** Levels at which the step's items are shown; step titles are always shown. */
  levels: Level[];
  items: TemplateItem[];
}

export interface Template {
  id: string;
  organ: string;
  version: number;
  steps: TemplateStep[];
}

export type ItemValue = 'yes' | 'no' | 'unsure';

export interface Annotation {
  id: string;
  type: 'point' | 'rect' | 'polygon';
  /** Image-pixel coordinates at full resolution. */
  points: [number, number][];
  itemId: string | null;
  note: string;
}

export interface ReadingSession {
  caseId: string;
  level: Level;
  step0Answers: Record<string, string>;
  answers: Record<string, { value: ItemValue; note: string }>;
  annotations: Annotation[];
  conclusion: Diagnosis | null;
  revealedAt: string | null;
  selfReview: Record<string, 'found' | 'missed' | 'aiWrong'>;
  updatedAt: string;
}

export interface TestResult {
  mode: 'pretest' | 'posttest';
  caseId: string;
  answer: Diagnosis;
  confidence: 1 | 2 | 3;
  durationMs: number;
  answeredAt: string;
}
