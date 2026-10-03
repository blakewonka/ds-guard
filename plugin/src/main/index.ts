import type { MainToUi, UiToMain } from '../shared/messages';
import type { AvailableLibrary, ConnectedLibrary } from '../shared/types';
import { buildIndex } from './classify';
import { buildManifest, localProfile, parseTeamId, summarize, upsert } from './libraries';
import { locate } from './navigate';
import { fileComponents, fileComponentSets, fileName, mapLimit, teamComponents } from './rest';
import { scan } from './scan';
import { loadLibraries, loadProject, saveLibraries, saveProject, type ProjectState } from './storage';

let libraries: ConnectedLibrary[] = [];
let project: ProjectState = { token: '', teamLink: '', available: [] };

const post = (msg: MainToUi) => figma.ui.postMessage(msg);

const postLibraries = () =>
  post({ type: 'libraries', hasToken: project.token !== '', available: project.available, libraries: summarize(libraries) });

async function setLibraries(next: ConnectedLibrary[]): Promise<void> {
  await saveLibraries(next);
  libraries = next;
  postLibraries();
}

function teamId(): string {
  const id = parseTeamId(project.teamLink);
  if (!id) throw new Error('That link has no team in it. Open the team in Figma and copy a link that contains /team/ followed by a number.');
  if (!project.token) throw new Error('Enter a Figma access token first.');
  return id;
}

/** Fetches a library's current keys; the version goes up each time it is refreshed. */
async function fetchLibrary(file: { key: string; name: string }, previous?: ConnectedLibrary): Promise<ConnectedLibrary> {
  const [components, sets] = await Promise.all([fileComponents(file.key, project.token), fileComponentSets(file.key, project.token)]);
  const version = previous ? previous.manifest.version + 1 : 1;
  return {
    use: previous ? previous.use : 'approved',
    manifest: buildManifest(file, components, sets, version, new Date().toISOString()),
  };
}

/** Lists the team's library files, and refreshes the keys of the ones already chosen. */
async function loadTeamLibraries(token: string, teamLink: string): Promise<void> {
  project = { token: token || project.token, teamLink, available: project.available };
  const counts = new Map<string, number>();
  for (const component of await teamComponents(teamId(), project.token)) {
    counts.set(component.file_key, (counts.get(component.file_key) ?? 0) + 1);
  }
  const keys = [...counts.keys()];
  const names = await mapLimit(keys, (key) => fileName(key, project.token));
  const available: AvailableLibrary[] = keys
    .map((key, i) => ({ libraryId: key, name: names[i] ?? `Library ${key}`, componentCount: counts.get(key) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));

  project = { ...project, available };
  await saveProject(project);

  const chosen = libraries.filter((l) => available.some((a) => a.libraryId === l.manifest.libraryId));
  const refreshed = await mapLimit(chosen, (l) => fetchLibrary({ key: l.manifest.libraryId, name: nameOf(l.manifest.libraryId) }, l));
  await setLibraries(refreshed.reduce(upsert, libraries));

  figma.notify(
    available.length === 0
      ? 'This team has no published libraries.'
      : `Found ${available.length} ${available.length === 1 ? 'library' : 'libraries'} in the team`,
  );
}

const nameOf = (libraryId: string) => project.available.find((a) => a.libraryId === libraryId)?.name ?? libraryId;

async function handle(msg: UiToMain): Promise<void> {
  switch (msg.type) {
    case 'ui-ready':
      [libraries, project] = await Promise.all([loadLibraries(), loadProject()]);
      post({
        type: 'init',
        tab: figma.command === 'libraries' ? 'Libraries' : 'Check',
        hasToken: project.token !== '',
        teamLink: project.teamLink,
        available: project.available,
        libraries: summarize(libraries),
      });
      break;
    case 'load-team':
      await loadTeamLibraries(msg.token.trim(), msg.teamLink.trim());
      break;
    case 'add-library': {
      teamId();
      const library = await fetchLibrary({ key: msg.libraryId, name: nameOf(msg.libraryId) });
      await setLibraries(upsert(libraries, library));
      break;
    }
    case 'set-library-use':
      await setLibraries(libraries.map((l) => (l.manifest.libraryId === msg.libraryId ? { ...l, use: msg.use } : l)));
      break;
    case 'remove-library':
      await setLibraries(libraries.filter((l) => l.manifest.libraryId !== msg.libraryId));
      break;
    case 'scan': {
      const { profile, bundle } = localProfile(libraries);
      const result = await scan(buildIndex(profile, bundle), {
        scope: msg.scope,
        includeHidden: msg.includeHidden,
        onProgress: (scanned) => post({ type: 'scan-progress', scanned }),
      });
      post({ type: 'scan-result', result });
      break;
    }
    case 'locate':
      await locate(msg.nodeId);
      break;
  }
}

figma.showUI(__html__, { width: 360, height: 560, themeColors: true });

figma.ui.onmessage = (msg: UiToMain) => {
  handle(msg).catch((err: unknown) => {
    figma.notify(`BirDS Guard: ${err instanceof Error ? err.message : String(err)}`, { error: true, timeout: 10000 });
    post({ type: 'error' });
  });
};
