import { RESEARCH, RESEARCH_BY_ID, type Branch } from '../data/research';
import type { Game } from '../game/Game';
import { canResearch } from '../game/state';
import { t } from '../i18n';
import { clear, fmt, h } from './dom';

const BRANCHES: Branch[] = ['tools', 'logistics', 'processing', 'economy'];

/** Skill tree dialog. Re-renders itself after every purchase. */
export function researchDialog(game: Game, close: () => void): HTMLElement {
  const wrap = h('div', { class: 'research-wrap' });
  const fpLabel = h('span');
  const dialog = h(
    'div',
    { class: 'dialog wide panel', 'data-testid': 'research' },
    h(
      'div',
      { class: 'research-head' },
      h('h2', null, '🔬 ', t('research.title')),
      h('div', { style: 'display:flex;gap:10px;align-items:center' }, fpLabel, h('button', { onclick: close }, t('menu.back'), ' ', h('kbd', null, 'Esc'))),
    ),
    wrap,
  );

  const render = () => {
    const st = game.state;
    fpLabel.textContent = `🔬 ${st.creative ? '∞' : st.fp.toFixed(1)}   💰 ${fmt(st.credits)}`;
    clear(wrap);
    const nodeEls = new Map<string, HTMLElement>();
    for (const b of BRANCHES) {
      const grid = h('div', { class: 'branch-grid' });
      for (const n of RESEARCH.filter((r) => r.branch === b)) {
        const status = canResearch(st, n.id);
        const cls = status === 'owned' ? 'owned' : status === 'locked' ? 'locked' : status === 'ok' ? 'available' : '';
        const missing = n.requires.filter((r) => !st.research.includes(r));
        const btn = h(
          'button',
          {
            class: `node ${cls} ${n.final ? 'final' : ''}`,
            style: `grid-row:${n.row + 1};grid-column:${n.col + 2} / span 2`,
            'data-node': n.id,
            title: missing.length ? t('research.requires', { list: missing.map((m) => t(`research.${m}.name`)).join(', ') }) : '',
            onclick: () => {
              if (game.research(n.id)) render();
            },
          },
          h('b', null, n.final ? '⭐ ' : '', t(`research.${n.id}.name`)),
          h('span', { class: 'd' }, t(`research.${n.id}.desc`)),
          status === 'owned'
            ? h('span', { class: 'c' }, '✔ ', t('research.owned'))
            : h(
                'span',
                { class: 'c' },
                h('span', { class: st.fp + 1e-9 >= n.cost.fp || st.creative ? 'fp' : 'bad' }, `🔬 ${n.cost.fp}`),
                h('span', { class: st.credits + 1e-9 >= n.cost.credits || st.creative ? 'cr' : 'bad' }, `💰 ${fmt(n.cost.credits)}`),
                status === 'locked' ? h('span', null, '🔒') : null,
              ),
        );
        nodeEls.set(n.id, btn);
        grid.append(btn);
      }
      wrap.append(h('div', { class: 'branch' }, h('h3', null, t(`research.branch.${b}`)), grid));
    }
    // connection lines, drawn after layout
    requestAnimationFrame(() => {
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      const base = wrap.getBoundingClientRect();
      for (const n of RESEARCH) {
        const to = nodeEls.get(n.id)?.getBoundingClientRect();
        if (!to) continue;
        for (const r of n.requires) {
          const from = nodeEls.get(r)?.getBoundingClientRect();
          if (!from) continue;
          const line = document.createElementNS(svgNS, 'path');
          const x1 = from.left + from.width / 2 - base.left + wrap.scrollLeft;
          const y1 = from.bottom - base.top;
          const x2 = to.left + to.width / 2 - base.left + wrap.scrollLeft;
          const y2 = to.top - base.top;
          const my = (y1 + y2) / 2;
          line.setAttribute('d', `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`);
          const owned = game.state.research.includes(r);
          line.setAttribute('stroke', owned ? 'rgba(63,208,160,0.7)' : 'rgba(143,227,255,0.25)');
          line.setAttribute('stroke-width', '2');
          line.setAttribute('fill', 'none');
          if (RESEARCH_BY_ID[r].branch !== n.branch) line.setAttribute('stroke-dasharray', '5 5');
          svg.append(line);
        }
      }
      wrap.append(svg);
    });
  };
  render();
  return dialog;
}
