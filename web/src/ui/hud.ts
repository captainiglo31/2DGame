import { BUILDINGS } from '../data/balance';
import { CONTRACTS } from '../data/contracts';
import { TOOLS, type Game, type ToolId } from '../game/Game';
import { activeContract, goalProgress, inventoryTotal, isUnlocked } from '../game/state';
import { t } from '../i18n';
import { LOOSE, MAT_COLORS, MAT_KEYS } from '../sim/materials';
import { clear, fmt, h, setText } from './dom';

const TOOL_ICONS: Record<ToolId, string> = { vacuum: '🌀', drill: '⛏️', build: '🧱', remove: '🪓' };

export interface HudActions {
  openResearch(): void;
  openMenu(): void;
}

export class Hud {
  root: HTMLElement;
  private game: Game;
  private credits = h('span', { class: 'value' });
  private fp = h('span', { class: 'value' });
  private tankText = h('span', { class: 'value' });
  private tankBar = h('div', { class: 'bar' }, h('i'));
  private env = h('span', { class: 'value' });
  private toolButtons = new Map<ToolId, HTMLButtonElement>();
  private context = h('div', { class: 'context panel' });
  private contract = h('div', { class: 'contract panel' });
  private toasts = h('div', { class: 'toasts' });
  private contextKey = '';
  private contractKey = '';
  private coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

  constructor(game: Game, actions: HudActions) {
    this.game = game;
    const toolbar = h('div', { class: 'toolbar panel' });
    TOOLS.forEach((id, i) => {
      const b = h(
        'button',
        { class: 'tool', title: t(`tool.${id}.desc`), onclick: () => game.setTool(id) },
        h('span', { class: 'icon' }, TOOL_ICONS[id]),
        h('span', { class: 'name' }, t(`tool.${id}`), ' ', h('kbd', null, String(i + 1))),
      );
      this.toolButtons.set(id, b);
      toolbar.append(b);
    });

    this.root = h(
      'div',
      { class: 'hud' },
      h(
        'div',
        { class: 'hud-top' },
        h('div', { class: 'stat panel gold', title: t('hud.credits') }, '💰', h('span', { class: 'label' }, t('hud.credits')), this.credits),
        h('div', { class: 'stat panel fp', title: t('hud.fp') }, '🔬', h('span', { class: 'label' }, t('hud.fp')), this.fp),
        h('div', { class: 'stat panel tank' }, h('span', { class: 'label' }, t('hud.tank')), this.tankBar, this.tankText),
        h('div', { class: 'stat panel' }, this.env),
      ),
      h(
        'div',
        { class: 'hud-right' },
        h(
          'div',
          { class: 'hud-buttons' },
          h('button', { onclick: actions.openResearch, 'data-testid': 'open-research' }, '🔬 ', t('hud.research'), ' ', h('kbd', null, 'T')),
          h('button', { onclick: actions.openMenu, 'data-testid': 'open-menu' }, '☰ ', t('hud.menu')),
        ),
        this.contract,
      ),
      h('div', { class: 'hud-bottom' }, this.context, toolbar),
      this.toasts,
    );
    this.contract.addEventListener('click', () => this.toggleContract());
  }

  toggleContract() {
    this.contract.classList.toggle('collapsed');
  }

  toast(msg: string, kind: 'info' | 'good' | 'warn' = 'info') {
    const el = h('div', { class: `toast panel ${kind}` }, msg);
    this.toasts.append(el);
    while (this.toasts.children.length > 4) this.toasts.firstChild?.remove();
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  }

  /** Called ~10× per second. */
  update() {
    const g = this.game;
    const st = g.state;
    setText(this.credits, fmt(st.credits));
    setText(this.fp, st.creative ? '∞' : st.fp.toFixed(1));
    const total = inventoryTotal(st);
    const cap = g.stats.vacCap;
    setText(this.tankText, `${fmt(total)}/${fmt(cap)}`);
    (this.tankBar.firstChild as HTMLElement).style.width = `${Math.min(100, (total / cap) * 100)}%`;
    this.tankBar.classList.toggle('full', total >= cap);
    setText(this.env, `${g.isNight() ? '🌙 ' + t('hud.night') : '☀️ ' + t('hud.day')} · ${g.tideRising() ? '🌊 ' + t('hud.tide.rising') : '〰️ ' + t('hud.tide.falling')}`);
    for (const [id, b] of this.toolButtons) b.classList.toggle('active', g.tool === id);
    this.updateContext();
    this.updateContract();
  }

  private updateContext() {
    const g = this.game;
    const inv = g.state.inventory;
    const invKey = LOOSE.map((m) => (inv[m] ? `${m}:${Math.floor(inv[m])}` : '')).join(',');
    const key = [g.tool, g.buildId, g.selectedMat, g.pickupWater, g.emitMode, g.brush, g.conveyorDir, g.pipeDir, g.state.research.length, invKey, Math.floor(g.state.credits / 5)].join('|');
    if (key === this.contextKey) return;
    this.contextKey = key;
    const c = this.context;
    clear(c);
    if (g.tool === 'vacuum') {
      if (this.coarse) {
        c.append(
          h('button', { class: `chip ${g.emitMode ? '' : 'active'}`, onclick: () => (g.emitMode = false) }, '🌀 ', t('hud.suck')),
          h('button', { class: `chip ${g.emitMode ? 'active' : ''}`, onclick: () => (g.emitMode = true) }, '💨 ', t('hud.emit')),
          h('span', { class: 'sep' }),
        );
      }
      const have = LOOSE.filter((m) => (inv[m] ?? 0) > 0);
      if (!have.length) c.append(h('span', { class: 'desc' }, t('tool.vacuum.desc')));
      for (const m of have) {
        c.append(
          h(
            'button',
            { class: `chip ${g.selectedMat === m ? 'active' : ''}`, onclick: () => (g.selectedMat = m), title: t(`mat.${MAT_KEYS[m]}`) },
            h('span', { class: 'swatch', style: `background:${MAT_COLORS[m]}` }),
            t(`mat.${MAT_KEYS[m]}`),
            h('b', null, fmt(inv[m])),
          ),
        );
      }
      c.append(
        h('span', { class: 'sep' }),
        h(
          'label',
          { class: 'toggle' },
          h('input', {
            type: 'checkbox',
            checked: g.pickupWater,
            onchange: (e: Event) => (g.pickupWater = (e.target as HTMLInputElement).checked),
          }),
          t('hud.filterWater'),
        ),
      );
    } else if (g.tool === 'build') {
      for (const b of BUILDINGS) {
        const unlocked = isUnlocked(g.state, b.unlock);
        const title = unlocked
          ? `${t(`build.${b.id}.desc`)}`
          : `🔒 ${t('research.requires', { list: t(`research.${b.unlock}.name`) })}`;
        c.append(
          h(
            'button',
            {
              class: `chip ${g.buildId === b.id ? 'active' : ''} ${unlocked ? '' : 'locked'}`,
              title,
              disabled: !unlocked,
              'data-build': b.id,
              onclick: () => (g.buildId = b.id),
            },
            h('span', { class: 'swatch', style: `background:${b.mode === 'pipe' ? '#9aa7b0' : MAT_COLORS[b.mat]}` }),
            unlocked ? '' : '🔒 ',
            t(`build.${b.id}`),
            h('span', { class: 'cost' }, b.cost + '¢'),
          ),
        );
      }
      const def = g.buildDef;
      c.append(h('span', { class: 'sep' }));
      if (def.mode !== 'stamp') {
        c.append(
          h('span', { class: 'desc' }, t('hud.brush')),
          h('button', { class: 'chip', onclick: () => (g.brush = Math.max(1, g.brush - 1)) }, '−'),
          h('b', null, String(g.brush)),
          h('button', { class: 'chip', onclick: () => (g.brush = Math.min(6, g.brush + 1)) }, '+'),
        );
      }
      if (def.id === 'conveyor' || def.id === 'pipe') {
        const dir = def.id === 'conveyor' ? (g.conveyorDir > 0 ? 2 : 4) : g.pipeDir;
        c.append(h('button', { class: 'chip', onclick: () => g.rotate() }, `${t('hud.direction')} ${['', '↑', '→', '↓', '←'][dir]} `, h('kbd', null, 'R')));
      }
      c.append(h('div', { class: 'desc', style: 'flex-basis:100%' }, t(`build.${def.id}.desc`)));
    } else {
      c.append(h('span', { class: 'desc' }, t(`tool.${g.tool}.desc`)));
      if (g.tool === 'remove') {
        c.append(
          h('span', { class: 'sep' }),
          h('button', { class: 'chip', onclick: () => (g.brush = Math.max(1, g.brush - 1)) }, '−'),
          h('b', null, String(g.brush + 1)),
          h('button', { class: 'chip', onclick: () => (g.brush = Math.min(6, g.brush + 1)) }, '+'),
        );
      }
    }
  }

  private updateContract() {
    const g = this.game;
    const st = g.state;
    const c = activeContract(st);
    const prog = c ? goalProgress(st, c) : null;
    const key = `${st.contractIndex}|${prog?.parts.map((p) => p.have).join(',')}|${g.settings.tutorialHints}`;
    if (key === this.contractKey) return;
    this.contractKey = key;
    const el = this.contract;
    clear(el);
    if (!c || !prog) {
      el.append(h('h3', null, '🏁 ', t('contract.allDone')));
      return;
    }
    el.append(h('h3', null, h('span', null, '📜 ', t(`contract.${c.id}.title`)), h('small', null, `${st.contractIndex + 1}/${CONTRACTS.length} `, h('kbd', null, 'C'))));
    c.goals.forEach((goal, i) => {
      const p = prog.parts[i];
      const done = p.have >= p.need;
      const label =
        goal.type === 'deliver'
          ? t('contract.goal.deliver', { mat: t(`mat.${MAT_KEYS[goal.mat]}`) })
          : t('contract.goal.research', { name: t(`research.${goal.id}.name`) });
      const row = h('div', { class: `goal ${done ? 'done' : ''}` }, h('div', { class: 'row' }, h('span', null, done ? '✔ ' : '• ', label), goal.type === 'deliver' ? h('span', null, `${fmt(p.have)}/${fmt(p.need)}`) : null));
      if (goal.type === 'deliver') {
        const bar = h('div', { class: 'bar' }, h('i', { style: `width:${(p.have / p.need) * 100}%` }));
        row.append(bar);
      }
      el.append(row);
    });
    const r = c.reward;
    if (r.credits || r.fp) el.append(h('div', { class: 'reward' }, `${t('contract.reward')}: ${r.credits ? `💰 ${r.credits}` : ''} ${r.fp ? `🔬 ${r.fp}` : ''}`));
    if (g.settings.tutorialHints) el.append(h('div', { class: 'hint' }, '💡 ', t(`contract.${c.id}.hint`)));
  }
}
