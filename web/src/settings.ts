import type { Lang } from './i18n';

export interface Settings {
  lang: Lang;
  master: number;
  sfx: number;
  music: number;
  uiScale: number;
  showFps: boolean;
  nightDarkness: boolean;
  reducedMotion: boolean;
  simSpeed: number;
  autosaveMin: number;
  edgePan: boolean;
  tutorialHints: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'de',
  master: 0.8,
  sfx: 0.8,
  music: 0.5,
  uiScale: 1,
  showFps: false,
  nightDarkness: true,
  reducedMotion: false,
  simSpeed: 1,
  autosaveMin: 3,
  edgePan: false,
  tutorialHints: true,
};

const KEY = 'abyssal.settings';

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadSettings(): Settings {
  const s = { ...DEFAULT_SETTINGS };
  try {
    const raw = storage()?.getItem(KEY);
    if (raw) Object.assign(s, sanitize(JSON.parse(raw)));
  } catch {
    /* corrupt settings: fall back to defaults */
  }
  if (!storage()?.getItem(KEY) && typeof navigator !== 'undefined' && !navigator.language.startsWith('de')) s.lang = 'en';
  return s;
}

export function saveSettings(s: Settings) {
  try {
    storage()?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

/** Drop unknown keys and wrong types from stored settings. */
export function sanitize(raw: unknown): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (typeof r[k] === typeof DEFAULT_SETTINGS[k]) (out as Record<string, unknown>)[k] = r[k];
  }
  if (out.lang && out.lang !== 'de' && out.lang !== 'en') delete out.lang;
  const clamp = (k: 'master' | 'sfx' | 'music', lo: number, hi: number) => {
    if (out[k] !== undefined) out[k] = Math.min(hi, Math.max(lo, out[k]!));
  };
  clamp('master', 0, 1);
  clamp('sfx', 0, 1);
  clamp('music', 0, 1);
  if (out.uiScale !== undefined) out.uiScale = Math.min(1.5, Math.max(0.7, out.uiScale));
  if (out.simSpeed !== undefined) out.simSpeed = Math.min(3, Math.max(0.5, out.simSpeed));
  return out;
}
