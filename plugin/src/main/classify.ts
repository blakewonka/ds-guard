// Pure classification logic: node facts + profile index -> state. No Figma runtime here.
import type { Classification, Fix, Manifest, Profile, ProfileBundle, State } from '../shared/types';

type KeyClass = 'approved' | 'wrong-brand' | 'deprecated';

export interface KeyEntry {
  name: string;
  libraryName: string;
  cls: KeyClass;
}

export interface ProfileIndex {
  profile: Profile;
  keys: Map<string, KeyEntry>;
  /** Lowercased approved component / set names, for suspected-detach matching. */
  names: Set<string>;
  orgExceptions: Set<string>;
  /** Library refs the profile names but the bundle does not contain. */
  missingManifests: string[];
}

export interface InstanceFacts {
  hasException: boolean;
  /** null when the main component is missing or deleted. */
  main: { key: string; name: string; remote: boolean; setKey?: string; setName?: string } | null;
}

export interface FrameFacts {
  name: string;
  hasException: boolean;
  detached: { type: 'library'; componentKey: string } | { type: 'local'; componentId: string } | null;
}

export function buildIndex(profile: Profile, bundle: ProfileBundle): ProfileIndex {
  const byRef = new Map<string, Manifest>();
  for (const m of bundle.manifests) byRef.set(`${m.libraryId}@${m.version}`, m);

  const keys = new Map<string, KeyEntry>();
  const names = new Set<string>();
  const missingManifests: string[] = [];

  const add = (refs: string[], cls: KeyClass) => {
    for (const ref of refs) {
      const m = byRef.get(ref);
      if (!m) {
        missingManifests.push(ref);
        continue;
      }
      for (const [key, set] of Object.entries(m.componentSets)) {
        keys.set(key, { name: set.name, libraryName: m.name, cls });
        if (cls === 'approved') names.add(set.name.toLowerCase());
      }
      for (const [key, c] of Object.entries(m.components)) {
        const setName = c.setKey ? m.componentSets[c.setKey]?.name : undefined;
        keys.set(key, { name: setName ?? c.name, libraryName: m.name, cls });
        if (cls === 'approved' && !c.setKey) names.add(c.name.toLowerCase());
      }
    }
  };

  // Later calls overwrite earlier ones, so approved wins when a key is listed twice.
  add(profile.otherBrandLibraries, 'wrong-brand');
  add(profile.deprecatedLibraries, 'deprecated');
  add(profile.approvedLibraries, 'approved');

  return {
    profile,
    keys,
    names,
    orgExceptions: new Set(profile.orgExceptions.map((e) => e.key)),
    missingManifests,
  };
}

export function classifyInstance(facts: InstanceFacts, index: ProfileIndex): Classification {
  const { main } = facts;
  if (!main) return { state: 'missing', confidence: 'certain', fixes: ['mark-exception'] };

  const componentName = main.setName ?? main.name;
  const base = { componentKey: main.key, componentName, confidence: 'certain' as const };

  const isOrgException =
    index.orgExceptions.has(main.key) || (main.setKey !== undefined && index.orgExceptions.has(main.setKey));
  if (facts.hasException || isOrgException) return { ...base, state: 'exception', fixes: [] };

  if (!main.remote) return { ...base, state: 'local', fixes: ['mark-exception', 'request-change'] };

  const entry = index.keys.get(main.key) ?? (main.setKey ? index.keys.get(main.setKey) : undefined);
  if (!entry) return { ...base, state: 'unknown-library', fixes: ['mark-exception', 'request-change'] };
  if (entry.cls === 'approved') return { ...base, state: 'approved', sourceLibrary: entry.libraryName, fixes: [] };

  const mapped = main.key in index.profile.mapping || (main.setKey !== undefined && main.setKey in index.profile.mapping);
  const fixes: Fix[] = mapped ? ['relink', 'mark-exception'] : ['mark-exception', 'request-change'];
  return { ...base, state: entry.cls, sourceLibrary: entry.libraryName, fixes };
}

/** Returns null for an ordinary frame, which is not a finding. */
export function classifyFrame(facts: FrameFacts, index: ProfileIndex): Classification | null {
  const { detached } = facts;
  if (!detached) {
    if (facts.hasException || !index.names.has(facts.name.toLowerCase())) return null;
    return { state: 'suspected-detach', componentName: facts.name, confidence: 'suspected', fixes: ['mark-exception'] };
  }

  let detachedFrom: State = 'local';
  let componentKey: string | undefined;
  let componentName: string | undefined;
  let sourceLibrary: string | undefined;
  if (detached.type === 'library') {
    componentKey = detached.componentKey;
    const entry = index.keys.get(detached.componentKey);
    detachedFrom = entry ? entry.cls : 'unknown-library';
    componentName = entry?.name;
    sourceLibrary = entry?.libraryName;
  }

  const common = { componentKey, componentName: componentName ?? facts.name, sourceLibrary, detachedFrom };
  if (facts.hasException) return { ...common, state: 'exception', confidence: 'certain', fixes: [] };
  return { ...common, state: 'detached', confidence: 'certain', fixes: ['restore', 'mark-exception', 'request-change'] };
}
