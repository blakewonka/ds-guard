// Pure helpers for the list of connected libraries. No Figma runtime here.
import type { ConnectedLibrary, LibrarySummary, LibraryUse, Manifest, Profile, ProfileBundle } from '../shared/types';

const DEFAULT_THRESHOLD = 1;

export function summarize(libraries: ConnectedLibrary[]): LibrarySummary[] {
  return libraries.map(({ use, manifest }) => ({
    libraryId: manifest.libraryId,
    name: manifest.name,
    version: manifest.version,
    indexedAt: manifest.indexedAt,
    use,
    componentCount: Object.keys(manifest.components).length,
  }));
}

/** Adds a library, or replaces the one with the same id in place. */
export function upsert(libraries: ConnectedLibrary[], library: ConnectedLibrary): ConnectedLibrary[] {
  const i = libraries.findIndex((l) => l.manifest.libraryId === library.manifest.libraryId);
  if (i === -1) return [...libraries, library];
  const next = libraries.slice();
  next[i] = library;
  return next;
}

/** The profile implied by the connected libraries and how each one is used. */
export function localProfile(libraries: ConnectedLibrary[]): { profile: Profile; bundle: ProfileBundle } {
  const refs = (use: LibraryUse) =>
    libraries.filter((l) => l.use === use).map((l) => `${l.manifest.libraryId}@${l.manifest.version}`);
  const profile: Profile = {
    id: 'local',
    name: 'Connected libraries',
    version: 1,
    approvedLibraries: refs('approved'),
    otherBrandLibraries: refs('other-brand'),
    deprecatedLibraries: refs('deprecated'),
    orgExceptions: [],
    mapping: {},
    threshold: DEFAULT_THRESHOLD,
  };
  return { profile, bundle: { profiles: [profile], manifests: libraries.map((l) => l.manifest) } };
}

/** Reads the team id out of any Figma link that contains one, or a bare id. */
export function parseTeamId(link: string): string | null {
  const trimmed = link.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = /\/team\/(\d+)/.exec(trimmed);
  return match ? match[1] : null;
}

/** Published components as Figma's REST API lists them for a file. */
export interface RestComponent {
  key: string;
  file_key: string;
  name: string;
  containing_frame?: {
    containingStateGroup?: { nodeId?: string };
    containingComponentSet?: { nodeId?: string };
  };
}

export interface RestComponentSet {
  key: string;
  name: string;
  node_id: string;
}

export function buildManifest(
  file: { key: string; name: string },
  components: RestComponent[],
  sets: RestComponentSet[],
  version: number,
  indexedAt: string,
): Manifest {
  const setKeyByNode = new Map<string, string>();
  const componentSets: Manifest['componentSets'] = {};
  for (const set of sets) {
    setKeyByNode.set(set.node_id, set.key);
    componentSets[set.key] = { name: set.name };
  }
  const outComponents: Manifest['components'] = {};
  for (const c of components) {
    const frame = c.containing_frame;
    const setNode = frame?.containingComponentSet?.nodeId ?? frame?.containingStateGroup?.nodeId;
    const setKey = setNode ? setKeyByNode.get(setNode) : undefined;
    outComponents[c.key] = setKey ? { name: c.name, setKey } : { name: c.name };
  }
  return { libraryId: file.key, name: file.name, version, indexedAt, components: outComponents, componentSets };
}
