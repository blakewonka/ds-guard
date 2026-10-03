import { describe, expect, it } from 'vitest';
import { score } from '../src/main/score';
import type { Finding, State } from '../src/shared/types';

let id = 0;
const finding = (screenId: string, state: State): Finding => ({
  nodeId: String(id++),
  pageId: 'p',
  screenId,
  state,
  confidence: state === 'suspected-detach' ? 'suspected' : 'certain',
  fixes: [],
});
const many = (screenId: string, state: State, n: number) => Array.from({ length: n }, () => finding(screenId, state));

describe('score', () => {
  it('passes an empty scan', () => {
    expect(score([], 0.8)).toEqual({ screens: [], passRate: 1, coverage: 1, pass: true });
  });

  it('computes coverage per screen and sorts worst first', () => {
    const s = score([...many('a', 'approved', 9), finding('a', 'local'), ...many('b', 'approved', 1), finding('b', 'detached')], 0.8);
    expect(s.screens.map((x) => x.screenId)).toEqual(['b', 'a']);
    expect(s.screens[0]).toMatchObject({ coverage: 0.5, pass: false });
    expect(s.screens[1]).toMatchObject({ coverage: 0.9, pass: true });
    expect(s.passRate).toBe(0.5);
    expect(s.coverage).toBeCloseTo(10 / 12);
    expect(s.pass).toBe(false);
  });

  it('treats the threshold as inclusive', () => {
    const s = score([...many('a', 'approved', 4), finding('a', 'wrong-brand')], 0.8);
    expect(s.screens[0].pass).toBe(true);
  });

  it('leaves exceptions and suspected detaches out of the score', () => {
    const s = score([finding('a', 'approved'), finding('a', 'exception'), finding('a', 'suspected-detach')], 0.8);
    expect(s.screens[0]).toMatchObject({ approved: 1, violations: 0, exceptions: 1, suspected: 1, coverage: 1, pass: true });
  });
});
