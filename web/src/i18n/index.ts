import { de } from './de';
import { en } from './en';

export type Lang = 'de' | 'en';
const tables: Record<Lang, Record<string, string>> = { de, en };
let lang: Lang = 'de';

export function setLang(l: Lang) {
  lang = tables[l] ? l : 'de';
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export function getLang(): Lang {
  return lang;
}

/** Translate `key`, replacing `{name}` placeholders. Falls back to German, then the key. */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = tables[lang][key] ?? tables.de[key] ?? key;
  if (params) for (const k in params) s = s.split(`{${k}}`).join(String(params[k]));
  return s;
}

export function missingKeys(): { lang: Lang; key: string }[] {
  const out: { lang: Lang; key: string }[] = [];
  for (const l of Object.keys(tables) as Lang[]) {
    for (const k of Object.keys(de)) if (!(k in tables[l])) out.push({ lang: l, key: k });
    for (const k of Object.keys(tables[l])) if (!(k in de)) out.push({ lang: 'de', key: k });
  }
  return out;
}
