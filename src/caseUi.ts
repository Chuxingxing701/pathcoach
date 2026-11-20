import type { CaseMeta, Diagnosis, Lang } from './types';
import type { I18nText } from './types';

export const DXES: { id: Diagnosis; key: 'dxNormal' | 'dxAdeno' | 'dxSquamous' }[] = [
  { id: 'normal', key: 'dxNormal' },
  { id: 'adeno', key: 'dxAdeno' },
  { id: 'squamous', key: 'dxSquamous' },
];

export const DX_LABELS: Record<Diagnosis, I18nText> = {
  normal: { en: 'Normal', zh: '正常' },
  adeno: { en: 'Adenocarcinoma', zh: '腺癌' },
  squamous: { en: 'Squamous cell carcinoma', zh: '鳞癌' },
};

export function clinicalLine(c: CaseMeta, lang: Lang): string {
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
