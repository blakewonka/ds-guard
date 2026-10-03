// Reads a team's library files through the Figma REST API. The Plugin API cannot list them.
import type { RestComponent, RestComponentSet } from './libraries';

const API = 'https://api.figma.com/v1';
const CONCURRENCY = 4;

const PAGE_SIZE = 1000;

function explain(status: number, detail: string): string {
  const reason = detail ? ` Figma says: "${detail}"` : '';
  if (status === 401 || status === 403) {
    return `Figma refused the request (${status}). The token needs the team_library_content:read, library_content:read and file_metadata:read scopes, and your account needs access to the team.${reason}`;
  }
  if (status === 404) return `Figma could not find that team or file (404). Check the team link.${reason}`;
  if (status === 429) return 'Figma rate limit reached. Try again in a minute.';
  return `Figma API error ${status}.${reason}`;
}

async function get(path: string, token: string): Promise<any> {
  const response = await fetch(API + path, { headers: { 'X-Figma-Token': token } });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(explain(response.status, String(body?.message ?? body?.err ?? '')));
  }
  return response.json();
}

/** Every published component in the team, across all its library files. */
export async function teamComponents(teamId: string, token: string): Promise<RestComponent[]> {
  const all: RestComponent[] = [];
  let after: number | undefined;
  for (;;) {
    const cursor = after === undefined ? '' : `&after=${after}`;
    const body = await get(`/teams/${teamId}/components?page_size=${PAGE_SIZE}${cursor}`, token);
    const page: RestComponent[] = body.meta?.components ?? [];
    all.push(...page);
    after = body.meta?.cursor?.after;
    if (page.length < PAGE_SIZE || after === undefined) return all;
  }
}

/** A file's name, or null when the token may not read it. */
export async function fileName(fileKey: string, token: string): Promise<string | null> {
  try {
    const body = await get(`/files/${fileKey}/meta`, token);
    return body.file?.name ?? body.name ?? null;
  } catch {
    return null;
  }
}

/** Published components of a file; empty when the file is not a library. */
export async function fileComponents(fileKey: string, token: string): Promise<RestComponent[]> {
  const body = await get(`/files/${fileKey}/components`, token);
  return body.meta?.components ?? [];
}

export async function fileComponentSets(fileKey: string, token: string): Promise<RestComponentSet[]> {
  const body = await get(`/files/${fileKey}/component_sets`, token);
  return body.meta?.component_sets ?? [];
}

/** Like Promise.all over map, but with a few requests in flight at a time. */
export async function mapLimit<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}
