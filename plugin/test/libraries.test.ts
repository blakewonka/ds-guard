import { describe, expect, it } from 'vitest';
import { buildIndex, classifyInstance } from '../src/main/classify';
import { buildManifest, localProfile, parseTeamId, summarize, upsert } from '../src/main/libraries';
import type { ConnectedLibrary } from '../src/shared/types';

const lib = (libraryId: string, use: ConnectedLibrary['use'], key: string, version = 1): ConnectedLibrary => ({
  use,
  manifest: { libraryId, name: libraryId, version, indexedAt: '2026-10-03T00:00:00Z', components: { [key]: { name: key } }, componentSets: {} },
});

const libraries = [lib('core', 'approved', 'k-core'), lib('brand-b', 'other-brand', 'k-b'), lib('legacy', 'deprecated', 'k-old')];

describe('localProfile', () => {
  it('classifies against each library according to its use', () => {
    const { profile, bundle } = localProfile(libraries);
    const index = buildIndex(profile, bundle);
    const state = (key: string) => classifyInstance({ hasException: false, main: { key, name: key, remote: true } }, index).state;
    expect(index.missingManifests).toEqual([]);
    expect([state('k-core'), state('k-b'), state('k-old'), state('k-none')]).toEqual([
      'approved',
      'wrong-brand',
      'deprecated',
      'unknown-library',
    ]);
  });
});

describe('upsert', () => {
  it('appends a new library and replaces a re-indexed one in place', () => {
    const next = upsert(upsert(libraries, lib('core', 'approved', 'k-core-2', 2)), lib('new', 'approved', 'k-new'));
    expect(next.map((l) => l.manifest.libraryId)).toEqual(['core', 'brand-b', 'legacy', 'new']);
    expect(next[0].manifest.version).toBe(2);
    expect(libraries[0].manifest.version).toBe(1);
  });
});

describe('summarize', () => {
  it('reports counts without the keys', () => {
    expect(summarize(libraries)[1]).toEqual({
      libraryId: 'brand-b',
      name: 'brand-b',
      version: 1,
      indexedAt: '2026-10-03T00:00:00Z',
      use: 'other-brand',
      componentCount: 1,
    });
  });
});

describe('parseTeamId', () => {
  it('reads the id from team links, project links under a team, and bare ids', () => {
    expect(parseTeamId('https://www.figma.com/files/team/123456/BirDS?fuid=9')).toBe('123456');
    expect(parseTeamId('https://www.figma.com/files/team/99/project/42/Libraries')).toBe('99');
    expect(parseTeamId(' 777 ')).toBe('777');
  });

  it('rejects links without a team', () => {
    expect(parseTeamId('https://www.figma.com/design/abc/File')).toBeNull();
    expect(parseTeamId('https://www.figma.com/files/project/42')).toBeNull();
    expect(parseTeamId('')).toBeNull();
  });
});

describe('buildManifest', () => {
  it('links variants to their component set and keeps standalone components', () => {
    const manifest = buildManifest(
      { key: 'file1', name: 'BirDS Core' },
      [
        { key: 'v1', file_key: 'file1', name: 'Size=Large', containing_frame: { containingStateGroup: { nodeId: '1:2' } } },
        { key: 'v2', file_key: 'file1', name: 'Size=Small', containing_frame: { containingComponentSet: { nodeId: '1:2' } } },
        { key: 'c1', file_key: 'file1', name: 'Icon/Close', containing_frame: {} },
        { key: 'c2', file_key: 'file1', name: 'Orphan', containing_frame: { containingStateGroup: { nodeId: '9:9' } } },
      ],
      [{ key: 's1', name: 'Button', node_id: '1:2' }],
      3,
      '2026-10-03T00:00:00Z',
    );
    expect(manifest).toEqual({
      libraryId: 'file1',
      name: 'BirDS Core',
      version: 3,
      indexedAt: '2026-10-03T00:00:00Z',
      components: {
        v1: { name: 'Size=Large', setKey: 's1' },
        v2: { name: 'Size=Small', setKey: 's1' },
        c1: { name: 'Icon/Close' },
        c2: { name: 'Orphan' },
      },
      componentSets: { s1: { name: 'Button' } },
    });
  });
});
