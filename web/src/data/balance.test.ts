// Balancing guard rails: the main path must be reachable with the rewards the game hands out.
import { describe, expect, it } from 'vitest';
import { CONTRACTS } from './contracts';
import { MATERIAL_VALUE } from './balance';
import { RESEARCH, RESEARCH_BY_ID } from './research';

/** All nodes needed for the final node, incl. contract research goals. */
function requiredPath(): Set<string> {
  const need = new Set<string>();
  const add = (id: string) => {
    if (need.has(id)) return;
    need.add(id);
    RESEARCH_BY_ID[id].requires.forEach(add);
  };
  for (const c of CONTRACTS) for (const g of c.goals) if (g.type === 'research') add(g.id);
  return need;
}

describe('balance', () => {
  it('contract deliveries + rewards cover the research needed to finish the alpha', () => {
    const need = requiredPath();
    const fpNeeded = [...need].reduce((s, id) => s + RESEARCH_BY_ID[id].cost.fp, 0);
    let fp = 0;
    let credits = 0;
    for (const c of CONTRACTS) {
      fp += c.reward.fp;
      credits += c.reward.credits;
      for (const g of c.goals) {
        if (g.type !== 'deliver') continue;
        fp += g.amount * MATERIAL_VALUE[g.mat].fp;
        credits += g.amount * MATERIAL_VALUE[g.mat].credits;
      }
    }
    // Playing the contracts must fund the mandatory path to the finale...
    expect(fp).toBeGreaterThan(fpNeeded);
    // ...but not the whole tree: optional upgrades need extra production.
    const fpTree = RESEARCH.reduce((s, n) => s + n.cost.fp, 0);
    expect(fp).toBeLessThan(fpTree * 0.85);
    const creditsNeeded = [...need].reduce((s, id) => s + RESEARCH_BY_ID[id].cost.credits, 0);
    expect(credits).toBeGreaterThan(creditsNeeded * 0.3);
  });

  it('research costs grow with depth', () => {
    for (const n of RESEARCH) {
      for (const r of n.requires) {
        const parent = RESEARCH_BY_ID[r];
        if (parent.branch === n.branch) expect(n.cost.fp, `${n.id} vs ${r}`).toBeGreaterThanOrEqual(parent.cost.fp);
      }
    }
  });

  it('refined goods are worth more than raw ones', () => {
    expect(MATERIAL_VALUE[3].credits).toBeGreaterThan(MATERIAL_VALUE[4].credits); // sand > wet sand
    expect(MATERIAL_VALUE[12].credits).toBeGreaterThan(MATERIAL_VALUE[3].credits * 5); // glass >> sand
  });
});
