// Walks the selection or the current page and classifies every instance and detached frame.
import type { ScanResult, ScanScope } from '../shared/messages';
import type { Classification, Finding } from '../shared/types';
import { classifyFrame, classifyInstance, type InstanceFacts, type ProfileIndex } from './classify';
import { score } from './score';

export const EXCEPTION_KEY = 'birds.exception';
const YIELD_EVERY = 400;

export interface ScanOptions {
  scope: ScanScope;
  includeHidden: boolean;
  onProgress: (scanned: number) => void;
}

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** The top-level frame a node belongs to: the ancestor sitting directly on the page or in a section. */
function screenOf(node: SceneNode): SceneNode {
  let current = node;
  while (current.parent && current.parent.type !== 'PAGE' && current.parent.type !== 'SECTION') {
    current = current.parent as SceneNode;
  }
  return current;
}

export async function scan(index: ProfileIndex, options: ScanOptions): Promise<ScanResult> {
  const page = figma.currentPage;
  const selection = page.selection;
  const scope: ScanScope = options.scope === 'selection' && selection.length > 0 ? 'selection' : 'page';

  const findings: Finding[] = [];
  const screens: Record<string, string> = {};
  const mainCache = new Map<string, InstanceFacts['main']>();
  let scanned = 0;

  const mainFacts = async (node: InstanceNode): Promise<InstanceFacts['main']> => {
    const main = await node.getMainComponentAsync();
    if (!main || main.removed) return null;
    let facts = mainCache.get(main.id);
    if (!facts) {
      const set = main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent : null;
      facts = { key: main.key, name: main.name, remote: main.remote, setKey: set?.key, setName: set?.name };
      mainCache.set(main.id, facts);
    }
    return facts;
  };

  const record = (node: SceneNode, screen: SceneNode, c: Classification) => {
    screens[screen.id] = screen.name;
    findings.push({ ...c, nodeId: node.id, pageId: page.id, screenId: screen.id });
  };

  const walk = async (node: SceneNode, screen: SceneNode): Promise<void> => {
    if (!options.includeHidden && !node.visible) return;
    if (++scanned % YIELD_EVERY === 0) {
      options.onProgress(scanned);
      await pause();
    }
    const hasException = node.getPluginData(EXCEPTION_KEY) !== '';
    if (node.type === 'INSTANCE') {
      record(node, screen, classifyInstance({ hasException, main: await mainFacts(node) }, index));
      // Instances are leaves: what a component is built from is its library's business.
      return;
    }
    if (node.type === 'FRAME') {
      const c = classifyFrame({ name: node.name, hasException, detached: node.detachedInfo }, index);
      if (c) record(node, screen, c);
    }
    if ('children' in node) {
      for (const child of node.children) await walk(child, screen);
    }
  };

  const walkTop = async (node: SceneNode): Promise<void> => {
    if (node.type === 'SECTION') {
      for (const child of node.children) await walkTop(child);
    } else {
      await walk(node, screenOf(node));
    }
  };

  for (const root of scope === 'selection' ? selection : page.children) await walkTop(root);

  const threshold = index.profile.threshold;
  return { scope, pageName: page.name, scanned, findings, screens, summary: score(findings, threshold), threshold };
}
