import type { Manifest, Profile, ProfileBundle } from '../src/shared/types';

const core: Manifest = {
  libraryId: 'birds-core',
  name: 'BirDS Core',
  version: 1,
  indexedAt: '2026-10-03T00:00:00Z',
  components: {
    'btn-primary-lg': { name: 'Type=Primary, Size=Large', setKey: 'btn-set' },
    'icon-close': { name: 'Icon/Close' },
    'device-frame': { name: 'Device frame' },
  },
  componentSets: { 'btn-set': { name: 'Button' } },
};

const brandB: Manifest = {
  libraryId: 'birds-brand-b',
  name: 'BirDS Brand B',
  version: 1,
  indexedAt: '2026-10-03T00:00:00Z',
  components: { 'b-card': { name: 'Card' }, 'b-banner': { name: 'Banner' } },
  componentSets: {},
};

const legacy: Manifest = {
  libraryId: 'birds-legacy',
  name: 'BirDS Legacy',
  version: 1,
  indexedAt: '2026-10-03T00:00:00Z',
  components: { 'old-btn': { name: 'Button (old)' } },
  componentSets: {},
};

export const profile: Profile = {
  id: 'brand-a',
  name: 'Brand A product',
  version: 1,
  approvedLibraries: ['birds-core@1', 'birds-brand-a@1'],
  otherBrandLibraries: ['birds-brand-b@1'],
  deprecatedLibraries: ['birds-legacy@1'],
  orgExceptions: [{ key: 'device-frame', reason: 'Device frames are not product UI' }],
  mapping: { 'old-btn': 'btn-primary-lg' },
  threshold: 0.8,
};

export const bundle: ProfileBundle = { profiles: [profile], manifests: [core, brandB, legacy] };
