// Pure game-state logic (no DOM, no WASM) so it can be unit tested.
import { BASE_STATS, MATERIAL_VALUE, WORLD, type Stats } from '../data/balance';
import { CONTRACTS, type Contract } from '../data/contracts';
import { RESEARCH, RESEARCH_BY_ID } from '../data/research';

export interface GameState {
  version: 1;
  seed: number;
  creative: boolean;
  credits: number;
  fp: number;
  inventory: Record<number, number>;
  research: string[];
  contractIndex: number;
  /** Deliveries counted towards the active contract. */
  contractProgress: Record<number, number>;
  stats: {
    delivered: Record<number, number>;
    earned: number;
    playTime: number;
    built: number;
  };
  alphaComplete: boolean;
  /** Player feet position in cells (absent in old saves). */
  player?: { x: number; y: number };
}

export function newState(seed: number, creative = false): GameState {
  return {
    version: 1,
    seed,
    creative,
    credits: creative ? 1e9 : WORLD.startCredits,
    fp: creative ? 1e6 : 0,
    inventory: {},
    research: creative ? RESEARCH.map((r) => r.id).filter((id) => !RESEARCH_BY_ID[id].final) : [],
    contractIndex: 0,
    contractProgress: {},
    stats: { delivered: {}, earned: 0, playTime: 0, built: 0 },
    alphaComplete: false,
  };
}

export function computeStats(research: string[]): Stats {
  const s: Stats = { ...BASE_STATS };
  // apply in tree order so later tiers override earlier ones
  for (const node of RESEARCH) {
    if (research.includes(node.id)) node.effect?.(s);
  }
  return s;
}

export function inventoryTotal(st: GameState): number {
  let n = 0;
  for (const k in st.inventory) n += st.inventory[k];
  return n;
}

/** Add delivered cells; returns credits and fp gained. */
export function deliver(st: GameState, counts: ArrayLike<number>, stats: Stats): { credits: number; fp: number } {
  let credits = 0;
  let fp = 0;
  for (let m = 0; m < counts.length; m++) {
    const n = counts[m];
    if (!n) continue;
    const v = MATERIAL_VALUE[m];
    if (v) {
      credits += n * v.credits * stats.priceMult;
      fp += n * v.fp;
    }
    st.stats.delivered[m] = (st.stats.delivered[m] ?? 0) + n;
    st.contractProgress[m] = (st.contractProgress[m] ?? 0) + n;
  }
  st.credits += credits;
  st.fp += fp;
  st.stats.earned += credits;
  return { credits, fp };
}

export type ResearchCheck = 'ok' | 'owned' | 'locked' | 'fp' | 'credits';

export function canResearch(st: GameState, id: string): ResearchCheck {
  const node = RESEARCH_BY_ID[id];
  if (!node) return 'locked';
  if (st.research.includes(id)) return 'owned';
  if (!node.requires.every((r) => st.research.includes(r))) return 'locked';
  if (st.fp + 1e-9 < node.cost.fp) return 'fp';
  if (st.credits + 1e-9 < node.cost.credits) return 'credits';
  return 'ok';
}

export function doResearch(st: GameState, id: string): boolean {
  if (canResearch(st, id) !== 'ok') return false;
  const node = RESEARCH_BY_ID[id];
  if (!st.creative) {
    st.fp -= node.cost.fp;
    st.credits -= node.cost.credits;
  }
  st.research.push(id);
  if (node.final) st.alphaComplete = true;
  return true;
}

export function activeContract(st: GameState): Contract | null {
  return CONTRACTS[st.contractIndex] ?? null;
}

export function goalProgress(st: GameState, c: Contract): { done: boolean; parts: { have: number; need: number }[] } {
  const parts = c.goals.map((g) => {
    if (g.type === 'deliver') return { have: Math.min(g.amount, st.contractProgress[g.mat] ?? 0), need: g.amount };
    return { have: st.research.includes(g.id) ? 1 : 0, need: 1 };
  });
  return { done: parts.every((p) => p.have >= p.need), parts };
}

/** Completes the active contract if all goals are met. Returns it when completed. */
export function checkContract(st: GameState): Contract | null {
  const c = activeContract(st);
  if (!c || !goalProgress(st, c).done) return null;
  st.credits += c.reward.credits;
  st.fp += c.reward.fp;
  st.contractIndex++;
  st.contractProgress = {};
  return c;
}

export function isUnlocked(st: GameState, id: string | null): boolean {
  return id === null || st.research.includes(id);
}

export function spend(st: GameState, amount: number): boolean {
  if (st.creative) return true;
  if (st.credits + 1e-9 < amount) return false;
  st.credits -= amount;
  return true;
}
