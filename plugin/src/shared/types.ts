/** One per library version: every published component / component-set key. */
export interface Manifest {
  libraryId: string;
  name: string;
  version: number;
  indexedAt: string;
  components: Record<string, { name: string; setKey?: string }>;
  componentSets: Record<string, { name: string }>;
}

export interface Profile {
  id: string;
  name: string;
  version: number;
  /** Library refs as "libraryId@version", e.g. "birds-core@14". */
  approvedLibraries: string[];
  otherBrandLibraries: string[];
  deprecatedLibraries: string[];
  orgExceptions: { key: string; reason: string }[];
  /** Legacy / wrong-brand component key -> approved component key. */
  mapping: Record<string, string>;
  /** Minimum coverage for a screen to pass, 0..1. */
  threshold: number;
}

/** How a connected library is treated when checking a file. */
export type LibraryUse = 'approved' | 'other-brand' | 'deprecated';

/** A team library the user chose to check against. */
export interface ConnectedLibrary {
  use: LibraryUse;
  manifest: Manifest;
}

/** What the UI needs to list a connected library, without its keys. */
export interface LibrarySummary {
  libraryId: string;
  name: string;
  version: number;
  indexedAt: string;
  use: LibraryUse;
  componentCount: number;
}

/** A library file found in the team, offered in the dropdown. The id is its file key. */
export interface AvailableLibrary {
  libraryId: string;
  name: string;
  componentCount: number;
}

export interface ProfileBundle {
  profiles: Profile[];
  manifests: Manifest[];
}

export type State =
  | 'approved'
  | 'wrong-brand'
  | 'deprecated'
  | 'unknown-library'
  | 'local'
  | 'missing'
  | 'detached'
  | 'suspected-detach'
  | 'exception';

export type Fix = 'restore' | 'relink' | 'mark-exception' | 'request-change';

export interface Finding {
  nodeId: string;
  pageId: string;
  /** Top-level frame containing the node. */
  screenId: string;
  state: State;
  componentKey?: string;
  componentName?: string;
  sourceLibrary?: string;
  /** For detached frames: what the original component would have classified as. */
  detachedFrom?: State;
  confidence: 'certain' | 'suspected';
  fixes: Fix[];
}

/** What the classifier decides; the scanner adds the node's location. */
export type Classification = Omit<Finding, 'nodeId' | 'pageId' | 'screenId'>;
