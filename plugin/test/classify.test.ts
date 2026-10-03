import { describe, expect, it } from 'vitest';
import { buildIndex, classifyFrame, classifyInstance } from '../src/main/classify';
import { bundle, profile } from './fixtures';

const index = buildIndex(profile, bundle);
const remote = (key: string, setKey?: string) => ({
  hasException: false,
  main: { key, name: key, remote: true, setKey },
});

describe('buildIndex', () => {
  it('reports library refs that have no manifest', () => {
    expect(index.missingManifests).toEqual(['birds-brand-a@1']);
  });
});

describe('classifyInstance', () => {
  it('approves a key from an approved library', () => {
    const c = classifyInstance(remote('icon-close'), index);
    expect(c.state).toBe('approved');
    expect(c.sourceLibrary).toBe('BirDS Core');
  });

  it('approves an unlisted variant through its component set key', () => {
    expect(classifyInstance(remote('btn-new-variant', 'btn-set'), index).state).toBe('approved');
  });

  it('flags another brand, with no relink when unmapped', () => {
    const c = classifyInstance(remote('b-card'), index);
    expect(c.state).toBe('wrong-brand');
    expect(c.fixes).not.toContain('relink');
  });

  it('flags deprecated and offers relink when mapped', () => {
    const c = classifyInstance(remote('old-btn'), index);
    expect(c.state).toBe('deprecated');
    expect(c.fixes).toContain('relink');
  });

  it('flags a remote key found in no manifest', () => {
    expect(classifyInstance(remote('who-knows'), index).state).toBe('unknown-library');
  });

  it('flags local components, including pasted copies', () => {
    const c = classifyInstance({ hasException: false, main: { key: 'x', name: 'Copy', remote: false } }, index);
    expect(c.state).toBe('local');
  });

  it('flags a missing main component', () => {
    expect(classifyInstance({ hasException: false, main: null }, index).state).toBe('missing');
  });

  it('honours node-level and org-level exceptions', () => {
    expect(classifyInstance({ ...remote('who-knows'), hasException: true }, index).state).toBe('exception');
    expect(classifyInstance(remote('device-frame'), index).state).toBe('exception');
  });
});

describe('classifyFrame', () => {
  const frame = { name: 'Frame 1', hasException: false, detached: null };

  it('ignores ordinary frames', () => {
    expect(classifyFrame(frame, index)).toBeNull();
  });

  it('reports a frame detached from an approved component', () => {
    const c = classifyFrame({ ...frame, detached: { type: 'library', componentKey: 'btn-primary-lg' } }, index);
    expect(c).toMatchObject({ state: 'detached', detachedFrom: 'approved', componentName: 'Button', confidence: 'certain' });
    expect(c?.fixes).toContain('restore');
  });

  it('reports what an off-system detach came from', () => {
    const unknown = classifyFrame({ ...frame, detached: { type: 'library', componentKey: 'nope' } }, index);
    const local = classifyFrame({ ...frame, detached: { type: 'local', componentId: '1:2' } }, index);
    expect(unknown?.detachedFrom).toBe('unknown-library');
    expect(local?.detachedFrom).toBe('local');
  });

  it('marks a name match as suspected only', () => {
    const c = classifyFrame({ ...frame, name: 'button' }, index);
    expect(c).toMatchObject({ state: 'suspected-detach', confidence: 'suspected' });
  });

  it('does not suspect names from non-approved libraries', () => {
    expect(classifyFrame({ ...frame, name: 'Card' }, index)).toBeNull();
  });

  it('honours an exception on a detached frame', () => {
    const c = classifyFrame({ ...frame, hasException: true, detached: { type: 'library', componentKey: 'icon-close' } }, index);
    expect(c?.state).toBe('exception');
  });
});
