import { M } from '../sim/materials';

export type Goal = { type: 'deliver'; mat: number; amount: number } | { type: 'research'; id: string };

export interface Contract {
  id: string;
  goals: Goal[];
  reward: { credits: number; fp: number };
}

/** Main quest line – also acts as the tutorial. Texts live in i18n (contract.<id>.*). */
export const CONTRACTS: Contract[] = [
  { id: 'c1', goals: [{ type: 'deliver', mat: M.SAND, amount: 150 }], reward: { credits: 60, fp: 4 } },
  { id: 'c2', goals: [{ type: 'research', id: 'conv' }, { type: 'deliver', mat: M.SAND, amount: 400 }], reward: { credits: 150, fp: 5 } },
  { id: 'c3', goals: [{ type: 'deliver', mat: M.GRAVEL, amount: 150 }], reward: { credits: 200, fp: 6 } },
  { id: 'c4', goals: [{ type: 'research', id: 'sieve' }, { type: 'deliver', mat: M.SHELL, amount: 120 }], reward: { credits: 300, fp: 8 } },
  { id: 'c5', goals: [{ type: 'research', id: 'dryer' }, { type: 'deliver', mat: M.SALT, amount: 100 }], reward: { credits: 500, fp: 10 } },
  { id: 'c6', goals: [{ type: 'deliver', mat: M.MAGNETITE, amount: 150 }], reward: { credits: 700, fp: 12 } },
  { id: 'c7', goals: [{ type: 'deliver', mat: M.SAND, amount: 3000 }], reward: { credits: 1500, fp: 15 } },
  { id: 'c8', goals: [{ type: 'research', id: 'furnace' }, { type: 'deliver', mat: M.GLASS, amount: 200 }], reward: { credits: 3000, fp: 25 } },
  { id: 'c9', goals: [{ type: 'research', id: 'final' }], reward: { credits: 0, fp: 0 } },
];
