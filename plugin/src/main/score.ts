// Pure scoring logic: findings -> per-screen coverage and overall pass rate.
import type { Finding } from '../shared/types';

export interface ScreenScore {
  screenId: string;
  approved: number;
  violations: number;
  exceptions: number;
  suspected: number;
  /** approved / (approved + violations); 1 when nothing is counted. */
  coverage: number;
  pass: boolean;
}

export interface ScoreSummary {
  /** Worst coverage first. */
  screens: ScreenScore[];
  /** Share of screens that pass, 0..1. */
  passRate: number;
  /** Coverage over all counted findings, 0..1. */
  coverage: number;
  pass: boolean;
}

export function score(findings: Finding[], threshold: number): ScoreSummary {
  const byScreen = new Map<string, ScreenScore>();
  for (const f of findings) {
    let s = byScreen.get(f.screenId);
    if (!s) {
      s = { screenId: f.screenId, approved: 0, violations: 0, exceptions: 0, suspected: 0, coverage: 1, pass: true };
      byScreen.set(f.screenId, s);
    }
    // Exceptions and suspected detaches are listed but never scored.
    if (f.state === 'exception') s.exceptions++;
    else if (f.state === 'suspected-detach') s.suspected++;
    else if (f.state === 'approved') s.approved++;
    else s.violations++;
  }

  let approved = 0;
  let violations = 0;
  const screens = [...byScreen.values()];
  for (const s of screens) {
    const counted = s.approved + s.violations;
    s.coverage = counted === 0 ? 1 : s.approved / counted;
    s.pass = s.coverage >= threshold;
    approved += s.approved;
    violations += s.violations;
  }
  screens.sort((a, b) => a.coverage - b.coverage || b.violations - a.violations);

  const passing = screens.filter((s) => s.pass).length;
  return {
    screens,
    passRate: screens.length === 0 ? 1 : passing / screens.length,
    coverage: approved + violations === 0 ? 1 : approved / (approved + violations),
    pass: passing === screens.length,
  };
}
