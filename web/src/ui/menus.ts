import { audio } from '../audio/audio';
import type { Game } from '../game/Game';
import { getLang, setLang, t, type Lang } from '../i18n';
import { MAT_KEYS } from '../sim/materials';
import { deleteSlot, readMeta, readSlot, SLOTS, validate, type SaveFile, type Slot } from '../save/save';
import { DEFAULT_SETTINGS, saveSettings, type Settings } from '../settings';
import { clear, fmt, fmtTime, h } from './dom';
import { researchDialog } from './researchUI';

/** Available languages, shown in their own name. Add a table in i18n/ to extend. */
export const LANGS: [Lang, string][] = [
  ['de', 'Deutsch'],
  ['en', 'English'],
];

export const VERSION = 'v0.1.0-alpha';

export interface MenuHost {
  game: Game;
  settings: Settings;
  /** Start a fresh world. */
  newGame(creative: boolean): void;
  loadFile(f: SaveFile): boolean;
  applySettings(): void;
  /** Rebuild HUD (e.g. after a language change). */
  rebuildHud(): void;
  toast(msg: string, kind?: 'info' | 'good' | 'warn'): void;
}

type Screen = 'title' | 'pause' | 'none';

/** Owns the overlay stack: title, pause, dialogs. */
export class Menus {
  private host: MenuHost;
  private layer: HTMLElement;
  private stack: (() => HTMLElement)[] = [];
  screen: Screen = 'title';
  inGame = false;

  constructor(host: MenuHost, parent: HTMLElement) {
    this.host = host;
    this.layer = h('div', { class: 'menus' });
    parent.append(this.layer);
  }

  get open(): boolean {
    return this.stack.length > 0;
  }

  private render() {
    clear(this.layer);
    const top = this.stack[this.stack.length - 1];
    this.host.game.paused = this.stack.length > 0;
    if (top) this.layer.append(top());
  }

  private push(view: () => HTMLElement) {
    this.stack.push(view);
    this.render();
  }

  back() {
    this.stack.pop();
    this.render();
  }

  closeAll() {
    this.stack = [];
    this.screen = 'none';
    this.render();
  }

  refresh() {
    this.render();
  }

  /** Escape key: close top dialog or open the pause menu. */
  escape() {
    if (this.screen === 'title' && this.stack.length <= 1) return;
    if (this.stack.length > 0) {
      this.back();
      if (!this.stack.length) this.screen = 'none';
    } else this.showPause();
  }

  /** Switch language everywhere: menus, HUD and the stored settings. */
  setLanguage(lang: Lang) {
    this.host.settings.lang = lang;
    setLang(lang);
    saveSettings(this.host.settings);
    this.host.rebuildHud();
    this.refresh();
  }

  // ------------------------------------------------------------- screens

  showTitle() {
    this.stack = [];
    this.screen = 'title';
    this.inGame = false;
    const latest = SLOTS.map((s) => readMeta(s)).filter(Boolean).sort((a, b) => b!.savedAt - a!.savedAt)[0];
    this.push(() =>
      h(
        'div',
        { class: 'overlay clear' },
        h(
          'div',
          { class: 'title-screen' },
          h('h1', null, t('game.title')),
          h('div', { class: 'sub' }, t('game.subtitle')),
          h(
            'div',
            { class: 'menu-list' },
            latest
              ? h(
                  'button',
                  {
                    class: 'primary',
                    'data-testid': 'continue',
                    onclick: () => {
                      const f = readSlot(latest.slot);
                      if (f && this.host.loadFile(f)) this.enterGame();
                      else this.host.toast(t('menu.loadFailed'), 'warn');
                    },
                  },
                  t('menu.continue'),
                )
              : null,
            h('button', { class: latest ? '' : 'primary', 'data-testid': 'new-game', onclick: () => this.startNew(false) }, t('menu.new')),
            h('button', { onclick: () => this.showSlots('load') }, t('menu.load')),
            h('button', { onclick: () => this.startNew(true) }, t('menu.creative')),
            h('button', { onclick: () => this.showSettings() }, t('menu.settings')),
            h('button', { onclick: () => this.showHelp() }, t('menu.help')),
            h('button', { onclick: () => this.showAbout() }, t('menu.about')),
          ),
        ),
        h(
          'div',
          { class: 'lang-switch', role: 'group', 'aria-label': t('settings.language') },
          ...LANGS.map(([code, label]) =>
            h(
              'button',
              {
                class: getLang() === code ? 'active' : '',
                'aria-pressed': String(getLang() === code),
                'data-lang': code,
                onclick: () => this.setLanguage(code),
              },
              label,
            ),
          ),
        ),
        h('div', { class: 'version' }, VERSION),
      ),
    );
  }

  private async startNew(creative: boolean) {
    if (this.inGame && !(await this.confirm(t('menu.confirmNew')))) return;
    this.host.newGame(creative);
    this.enterGame();
    if (this.host.settings.tutorialHints && !creative) this.showWelcome();
  }

  showWelcome() {
    this.push(() =>
      h(
        'div',
        { class: 'overlay' },
        h(
          'div',
          { class: 'dialog panel', 'data-testid': 'welcome' },
          h('h2', null, '🌊 ', t('welcome.title')),
          h('p', { style: 'line-height:1.5' }, t('welcome.intro')),
          h('ol', { style: 'line-height:1.6;padding-left:1.2em' }, ...t('welcome.steps').split('\n').map((s) => h('li', null, s))),
          h(
            'div',
            { class: 'actions' },
            h('button', { onclick: () => this.showHelp() }, t('menu.help')),
            h('button', { class: 'primary', 'data-testid': 'welcome-ok', onclick: () => this.closeAll() }, t('welcome.go')),
          ),
        ),
      ),
    );
  }

  enterGame() {
    this.inGame = true;
    this.closeAll();
    audio.unlock();
  }

  showPause() {
    if (!this.inGame) return;
    this.screen = 'pause';
    this.push(() =>
      h(
        'div',
        { class: 'overlay' },
        h(
          'div',
          { class: 'dialog panel', 'data-testid': 'pause' },
          h('h2', null, t('menu.paused')),
          h(
            'div',
            { class: 'menu-list' },
            h('button', { class: 'primary', onclick: () => this.closeAll() }, t('menu.resume')),
            h('button', { onclick: () => this.showSlots('save') }, t('menu.save')),
            h('button', { onclick: () => this.showSlots('load') }, t('menu.load')),
            h('button', { onclick: () => this.showStats() }, t('menu.stats')),
            h('button', { onclick: () => this.showSettings() }, t('menu.settings')),
            h('button', { onclick: () => this.showHelp() }, t('menu.help')),
            h(
              'button',
              {
                onclick: async () => {
                  if (await this.confirm(t('menu.confirmNew'))) this.showTitle();
                },
              },
              t('menu.mainmenu'),
            ),
          ),
        ),
      ),
    );
  }

  showResearch() {
    if (!this.inGame) return;
    this.push(() => h('div', { class: 'overlay' }, researchDialog(this.host.game, () => this.escape())));
  }

  showSlots(mode: 'save' | 'load') {
    const view = () => {
      const list = h('div');
      for (const slot of SLOTS) {
        if (mode === 'save' && slot === 'auto') continue;
        const meta = readMeta(slot);
        const name = slot === 'auto' ? t('menu.autosave') : t('menu.slot', { n: slot });
        const info = meta
          ? h(
              'small',
              null,
              `${new Date(meta.savedAt).toLocaleString(getLang())} · 💰 ${fmt(meta.credits)} · 📜 ${meta.contract + 1} · ⏱ ${fmtTime(meta.playTime)}${meta.creative ? ' · ' + t('menu.creative') : ''}`,
            )
          : h('small', null, t('menu.empty'));
        list.append(
          h(
            'div',
            { class: 'slot' },
            h('div', { class: 'info' }, h('b', null, name), info),
            mode === 'save'
              ? h('button', { class: 'primary', 'data-slot': slot, onclick: () => this.saveTo(slot, !!meta) }, t('menu.save'))
              : h('button', { class: 'primary', disabled: !meta, onclick: () => this.loadFrom(slot) }, t('menu.load')),
            meta ? h('button', { title: t('menu.export'), onclick: () => this.exportSlot(slot) }, '⤓') : null,
            meta
              ? h(
                  'button',
                  {
                    class: 'danger',
                    title: t('menu.delete'),
                    onclick: async () => {
                      if (await this.confirm(t('menu.confirmDelete'))) {
                        deleteSlot(slot);
                        this.refresh();
                      }
                    },
                  },
                  '✕',
                )
              : null,
          ),
        );
      }
      return h(
        'div',
        { class: 'overlay' },
        h(
          'div',
          { class: 'dialog panel' },
          h('h2', null, mode === 'save' ? t('menu.save') : t('menu.load')),
          list,
          h(
            'div',
            { class: 'actions' },
            mode === 'load' ? h('button', { onclick: () => this.importFile() }, '⤒ ', t('menu.import')) : null,
            this.inGame && mode === 'save' ? h('button', { onclick: () => this.exportCurrent() }, '⤓ ', t('menu.export')) : null,
            h('button', { onclick: () => this.back() }, t('menu.back')),
          ),
        ),
      );
    };
    this.push(view);
  }

  private async saveTo(slot: Slot, exists: boolean) {
    if (exists && !(await this.confirm(t('menu.confirmOverwrite')))) return;
    if (this.host.game.save(slot)) {
      this.host.toast(t('menu.saved'), 'good');
      this.refresh();
    } else this.host.toast(t('menu.loadFailed'), 'warn');
  }

  private loadFrom(slot: Slot) {
    const f = readSlot(slot);
    if (f && this.host.loadFile(f)) {
      this.host.toast(t('menu.loaded'), 'good');
      this.enterGame();
    } else this.host.toast(t('menu.loadFailed'), 'warn');
  }

  private download(f: SaveFile) {
    const blob = new Blob([JSON.stringify(f)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `abyssal-drift-${new Date(f.savedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  private exportSlot(slot: Slot) {
    const f = readSlot(slot);
    if (f) this.download(f);
  }

  private exportCurrent() {
    this.download(this.host.game.exportSave());
  }

  private importFile() {
    const input = h('input', { type: 'file', accept: '.json,application/json' });
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const f = JSON.parse(await file.text());
        if (validate(f) && this.host.loadFile(f)) {
          this.host.toast(t('menu.loaded'), 'good');
          this.enterGame();
          return;
        }
      } catch {
        /* fall through */
      }
      this.host.toast(t('menu.loadFailed'), 'warn');
    };
    input.click();
  }

  showSettings() {
    const s = this.host.settings;
    const commit = () => {
      saveSettings(s);
      this.host.applySettings();
    };
    const slider = (key: 'master' | 'sfx' | 'music', min = 0, max = 1, step = 0.05) =>
      h('input', {
        type: 'range',
        min,
        max,
        step,
        value: s[key],
        oninput: (e: Event) => {
          s[key] = Number((e.target as HTMLInputElement).value);
          commit();
        },
      });
    const check = (key: 'showFps' | 'nightDarkness' | 'reducedMotion' | 'edgePan' | 'tutorialHints') =>
      h('input', {
        type: 'checkbox',
        checked: s[key],
        onchange: (e: Event) => {
          s[key] = (e.target as HTMLInputElement).checked;
          commit();
        },
      });
    const select = (value: string, options: [string, string][], onchange: (v: string) => void) => {
      const el = h('select', { onchange: (e: Event) => onchange((e.target as HTMLSelectElement).value) });
      for (const [v, label] of options) el.append(h('option', { value: v, selected: v === value }, label));
      return el;
    };
    this.push(() =>
      h(
        'div',
        { class: 'overlay' },
        h(
          'div',
          { class: 'dialog panel', 'data-testid': 'settings' },
          h('h2', null, t('settings.title')),
          h(
            'div',
            { class: 'settings-grid' },
            h('span', null, t('settings.language')),
            select(
              getLang(),
              LANGS,
              (v) => this.setLanguage(v as Lang),
            ),
            h('h3', null, t('settings.audio')),
            h('span', null, t('settings.master')),
            slider('master'),
            h('span', null, t('settings.sfx')),
            slider('sfx'),
            h('span', null, t('settings.music')),
            slider('music'),
            h('h3', null, t('settings.graphics')),
            h('span', null, t('settings.uiScale')),
            select(
              String(s.uiScale),
              ['0.8', '0.9', '1', '1.1', '1.25', '1.4'].map((v) => [v, `${Math.round(Number(v) * 100)} %`]),
              (v) => {
                s.uiScale = Number(v);
                commit();
              },
            ),
            h('span', null, t('settings.showFps')),
            check('showFps'),
            h('span', null, t('settings.nightDarkness')),
            check('nightDarkness'),
            h('span', null, t('settings.reducedMotion')),
            check('reducedMotion'),
            h('h3', null, t('settings.gameplay')),
            h('span', null, t('settings.simSpeed')),
            select(
              String(s.simSpeed),
              [
                ['0.5', '50 %'],
                ['1', t('settings.normal')],
                ['1.5', '150 %'],
                ['2', '200 %'],
              ],
              (v) => {
                s.simSpeed = Number(v);
                commit();
              },
            ),
            h('span', null, t('settings.autosave')),
            select(
              String(s.autosaveMin),
              [
                ['0', t('settings.autosave.off')],
                ['1', t('settings.autosave.min', { n: 1 })],
                ['3', t('settings.autosave.min', { n: 3 })],
                ['5', t('settings.autosave.min', { n: 5 })],
                ['10', t('settings.autosave.min', { n: 10 })],
              ],
              (v) => {
                s.autosaveMin = Number(v);
                commit();
              },
            ),
            h('span', null, t('settings.edgePan')),
            check('edgePan'),
            h('span', null, t('settings.tutorialHints')),
            check('tutorialHints'),
          ),
          h(
            'div',
            { class: 'actions' },
            h('button', { onclick: () => this.showHelp() }, t('settings.controls')),
            h(
              'button',
              {
                class: 'danger',
                onclick: () => {
                  Object.assign(s, DEFAULT_SETTINGS, { lang: s.lang });
                  commit();
                  this.refresh();
                },
              },
              t('settings.reset'),
            ),
            h('button', { class: 'primary', onclick: () => this.back() }, t('menu.back')),
          ),
        ),
      ),
    );
  }

  showHelp() {
    this.push(() => {
      const table = h('table', { class: 'help-table' });
      for (const row of t('help.rows').split('\n')) {
        const [k, v] = row.split('|');
        table.append(h('tr', null, h('td', null, k), h('td', null, v)));
      }
      return h(
        'div',
        { class: 'overlay' },
        h('div', { class: 'dialog panel' }, h('h2', null, t('help.title')), table, h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => this.back() }, t('menu.back')))),
      );
    });
  }

  showAbout() {
    this.push(() =>
      h(
        'div',
        { class: 'overlay' },
        h(
          'div',
          { class: 'dialog panel' },
          h('h2', null, t('game.title'), ' ', h('small', { style: 'color:var(--muted);font-size:0.6em' }, VERSION)),
          h('p', { style: 'line-height:1.5' }, t('menu.aboutText')),
          h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => this.back() }, t('menu.back'))),
        ),
      ),
    );
  }

  showStats() {
    const st = this.host.game.state;
    this.push(() => {
      const table = h('table', { class: 'stats-table' });
      const row = (k: string, v: string) => table.append(h('tr', null, h('td', null, k), h('td', null, v)));
      row('⏱', fmtTime(st.stats.playTime));
      row('💰 Σ', fmt(st.stats.earned));
      row('🧱', fmt(st.stats.built));
      row('📜', `${st.contractIndex}`);
      row('🔬', `${st.research.length}`);
      for (const [m, n] of Object.entries(st.stats.delivered)) if (n) row(t(`mat.${MAT_KEYS[Number(m)]}`), fmt(n));
      return h(
        'div',
        { class: 'overlay' },
        h('div', { class: 'dialog panel' }, h('h2', null, t('menu.stats')), table, h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => this.back() }, t('menu.back')))),
      );
    });
  }

  showEnd() {
    this.push(() =>
      h(
        'div',
        { class: 'overlay' },
        h(
          'div',
          { class: 'dialog panel', style: 'text-align:center' },
          h('div', { style: 'font-size:3em' }, '🌊⭐'),
          h('h2', null, t('end.title')),
          h('p', { style: 'line-height:1.5' }, t('end.text')),
          h('p', { style: 'color:var(--muted)' }, `⏱ ${fmtTime(this.host.game.state.stats.playTime)} · 💰 ${fmt(this.host.game.state.stats.earned)}`),
          h('div', { class: 'actions', style: 'justify-content:center' }, h('button', { class: 'primary', onclick: () => this.closeAll() }, t('end.continue'))),
        ),
      ),
    );
  }

  confirm(msg: string): Promise<boolean> {
    return new Promise((resolve) => {
      const done = (v: boolean) => {
        this.back();
        resolve(v);
      };
      this.push(() =>
        h(
          'div',
          { class: 'overlay' },
          h(
            'div',
            { class: 'dialog panel', 'data-testid': 'confirm' },
            h('p', null, msg),
            h('div', { class: 'actions' }, h('button', { onclick: () => done(false) }, '✕'), h('button', { class: 'primary', onclick: () => done(true) }, '✓')),
          ),
        ),
      );
    });
  }
}
