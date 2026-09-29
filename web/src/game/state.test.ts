import { describe, expect, it } from 'vitest';
import { BUILDINGS, MATERIAL_VALUE } from '../data/balance';
import { CONTRACTS } from '../data/contracts';
import { RESEARCH, RESEARCH_BY_ID } from '../data/research';
import { M } from '../sim/materials';
import { canResearch, checkContract, computeStats, deliver, doResearch, goalProgress, newState, spend } from './state';

describe('economy', () => {
  it('delivering pays credits and research and tracks contract progress', () => {
    const st = newState(1);
    const counts = new Array(32).fill(0);
    counts[M.SAND] = 100;
    counts[M.GLASS] = 10;
    const g = deliver(st, counts, computeStats([]));
    expect(g.credits).toBeCloseTo(100 * MATERIAL_VALUE[M.SAND].credits + 10 * MATERIAL_VALUE[M.GLASS].credits);
    expect(st.contractProgress[M.SAND]).toBe(100);
    expect(st.stats.delivered[M.GLASS]).toBe(10);
  });

  it('price research multiplies sale value', () => {
    const st = newState(1);
    const counts = new Array(32).fill(0);
    counts[M.SAND] = 100;
    const g = deliver(st, counts, computeStats(['price1']));
    expect(g.credits).toBeCloseTo(115);
  });

  it('spend refuses when broke, creative never runs out', () => {
    const st = newState(1);
    expect(spend(st, 1e6)).toBe(false);
    expect(spend(newState(1, true), 1e12)).toBe(true);
  });
});

describe('research', () => {
  it('requires prerequisites and resources', () => {
    const st = newState(1);
    expect(canResearch(st, 'vac2')).toBe('locked');
    expect(canResearch(st, 'vac1')).toBe('fp');
    st.fp = 100;
    st.credits = 50;
    expect(canResearch(st, 'vac1')).toBe('credits');
    st.credits = 10000;
    expect(doResearch(st, 'vac1')).toBe(true);
    expect(canResearch(st, 'vac1')).toBe('owned');
    expect(computeStats(st.research).vacCap).toBe(600);
  });

  it('all requirements reference existing nodes and the tree is acyclic', () => {
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (id: string) => {
      expect(RESEARCH_BY_ID[id], id).toBeDefined();
      if (done.has(id)) return;
      expect(visiting.has(id), `cycle at ${id}`).toBe(false);
      visiting.add(id);
      RESEARCH_BY_ID[id].requires.forEach(visit);
      visiting.delete(id);
      done.add(id);
    };
    RESEARCH.forEach((n) => visit(n.id));
  });

  it('every building unlock exists', () => {
    for (const b of BUILDINGS) if (b.unlock) expect(RESEARCH_BY_ID[b.unlock], b.id).toBeDefined();
  });

  it('final research completes the alpha', () => {
    const st = newState(1, true);
    expect(doResearch(st, 'final')).toBe(true);
    expect(st.alphaComplete).toBe(true);
  });
});

describe('contracts', () => {
  it('complete in order and pay rewards', () => {
    const st = newState(1);
    const counts = new Array(32).fill(0);
    counts[M.SAND] = 150;
    deliver(st, counts, computeStats([]));
    const before = st.credits;
    const c = checkContract(st);
    expect(c?.id).toBe('c1');
    expect(st.credits).toBe(before + CONTRACTS[0].reward.credits);
    expect(st.contractIndex).toBe(1);
    // progress resets for the next contract
    expect(goalProgress(st, CONTRACTS[1]).parts[1].have).toBe(0);
  });

  it('research goals reference existing nodes', () => {
    for (const c of CONTRACTS) for (const g of c.goals) if (g.type === 'research') expect(RESEARCH_BY_ID[g.id]).toBeDefined();
  });
});
