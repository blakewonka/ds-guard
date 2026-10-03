// Everything lives in clientStorage: per user and machine, shared across files.
import type { AvailableLibrary, ConnectedLibrary } from '../shared/types';

const LIBRARIES_KEY = 'birds.libraries';
const PROJECT_KEY = 'birds.project';

/** The team the libraries are read from, and what was found there last time. */
export interface ProjectState {
  token: string;
  teamLink: string;
  available: AvailableLibrary[];
}

export async function loadLibraries(): Promise<ConnectedLibrary[]> {
  const stored = await figma.clientStorage.getAsync(LIBRARIES_KEY);
  return Array.isArray(stored) ? (stored as ConnectedLibrary[]) : [];
}

export async function saveLibraries(libraries: ConnectedLibrary[]): Promise<void> {
  await figma.clientStorage.setAsync(LIBRARIES_KEY, libraries);
}

export async function loadProject(): Promise<ProjectState> {
  const stored = await figma.clientStorage.getAsync(PROJECT_KEY);
  return { token: stored?.token ?? '', teamLink: stored?.teamLink ?? '', available: stored?.available ?? [] };
}

export async function saveProject(project: ProjectState): Promise<void> {
  await figma.clientStorage.setAsync(PROJECT_KEY, project);
}
