import type { Stats } from './balance';

export type Branch = 'tools' | 'logistics' | 'processing' | 'economy';

export interface ResearchNode {
  id: string;
  branch: Branch;
  /** Row inside the branch column (0 = top). */
  row: number;
  /** Lateral offset inside the column (-1, 0, 1). */
  col: number;
  cost: { fp: number; credits: number };
  requires: string[];
  /** Stat modifications applied when researched. */
  effect?: (s: Stats) => void;
  /** Ends the alpha when researched. */
  final?: boolean;
}

export const RESEARCH: ResearchNode[] = [
  // ---- tools
  { id: 'vac1', branch: 'tools', row: 0, col: 0, cost: { fp: 3, credits: 100 }, requires: [], effect: (s) => (s.vacCap = 600) },
  { id: 'vac2', branch: 'tools', row: 1, col: -1, cost: { fp: 10, credits: 600 }, requires: ['vac1'], effect: (s) => (s.vacCap = 1200) },
  { id: 'vac3', branch: 'tools', row: 2, col: -1, cost: { fp: 25, credits: 3000 }, requires: ['vac2'], effect: (s) => (s.vacCap = 2500) },
  {
    id: 'rad1',
    branch: 'tools',
    row: 1,
    col: 1,
    cost: { fp: 5, credits: 250 },
    requires: ['vac1'],
    effect: (s) => {
      s.vacRadius = 8;
      s.vacRate = 22;
      s.emitRate = 16;
    },
  },
  {
    id: 'rad2',
    branch: 'tools',
    row: 2,
    col: 1,
    cost: { fp: 15, credits: 1500 },
    requires: ['rad1'],
    effect: (s) => {
      s.vacRadius = 11;
      s.vacRate = 36;
      s.emitRate = 26;
    },
  },
  {
    id: 'drill1',
    branch: 'tools',
    row: 3,
    col: 0,
    cost: { fp: 4, credits: 150 },
    requires: ['vac1'],
    effect: (s) => {
      s.drillPower = 0.05;
      s.drillRadius = 6;
    },
  },
  {
    id: 'drill2',
    branch: 'tools',
    row: 4,
    col: 0,
    cost: { fp: 15, credits: 1200 },
    requires: ['drill1'],
    effect: (s) => {
      s.drillPower = 0.12;
      s.drillRadius = 8;
    },
  },
  // ---- logistics
  { id: 'conv', branch: 'logistics', row: 0, col: 0, cost: { fp: 2, credits: 50 }, requires: [] },
  { id: 'conv2', branch: 'logistics', row: 1, col: -1, cost: { fp: 8, credits: 500 }, requires: ['conv'], effect: (s) => (s.convP = 0.85) },
  { id: 'pipe', branch: 'logistics', row: 1, col: 1, cost: { fp: 12, credits: 800 }, requires: ['conv'] },
  { id: 'inlet', branch: 'logistics', row: 2, col: 1, cost: { fp: 20, credits: 2000 }, requires: ['pipe'] },
  // ---- processing
  { id: 'sieve', branch: 'processing', row: 0, col: -1, cost: { fp: 3, credits: 80 }, requires: [] },
  { id: 'dryer', branch: 'processing', row: 0, col: 1, cost: { fp: 5, credits: 200 }, requires: [] },
  {
    id: 'dryer2',
    branch: 'processing',
    row: 1,
    col: 1,
    cost: { fp: 12, credits: 1000 },
    requires: ['dryer'],
    effect: (s) => {
      s.heatP = 0.45;
      s.heatR = 2;
    },
  },
  { id: 'magnet', branch: 'processing', row: 1, col: -1, cost: { fp: 8, credits: 600 }, requires: ['sieve'] },
  {
    id: 'magnet2',
    branch: 'processing',
    row: 2,
    col: -1,
    cost: { fp: 15, credits: 1500 },
    requires: ['magnet'],
    effect: (s) => {
      s.magR = 10;
      s.magSamples = 12;
    },
  },
  { id: 'furnace', branch: 'processing', row: 2, col: 1, cost: { fp: 15, credits: 1500 }, requires: ['dryer'] },
  { id: 'drillm', branch: 'processing', row: 3, col: 0, cost: { fp: 10, credits: 800 }, requires: ['drill1'], effect: (s) => (s.drillP = 0.05) },
  {
    id: 'drillm2',
    branch: 'processing',
    row: 4,
    col: 0,
    cost: { fp: 18, credits: 2500 },
    requires: ['drillm'],
    effect: (s) => {
      s.drillP = 0.12;
      s.drillR = 80;
    },
  },
  // ---- economy
  { id: 'price1', branch: 'economy', row: 0, col: 0, cost: { fp: 6, credits: 300 }, requires: [], effect: (s) => (s.priceMult = 1.15) },
  { id: 'sun', branch: 'economy', row: 1, col: -1, cost: { fp: 6, credits: 400 }, requires: ['price1'], effect: (s) => (s.sun = 0.18) },
  { id: 'price2', branch: 'economy', row: 1, col: 1, cost: { fp: 20, credits: 2500 }, requires: ['price1'], effect: (s) => (s.priceMult = 1.35) },
  {
    id: 'final',
    branch: 'economy',
    row: 3,
    col: 0,
    cost: { fp: 60, credits: 10000 },
    requires: ['furnace', 'magnet', 'pipe'],
    final: true,
  },
];

export const RESEARCH_BY_ID: Record<string, ResearchNode> = Object.fromEntries(RESEARCH.map((n) => [n.id, n]));
