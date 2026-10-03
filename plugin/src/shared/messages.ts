import type { AvailableLibrary, Finding, LibrarySummary, LibraryUse } from './types';
import type { ScoreSummary } from '../main/score';

export type ScanScope = 'selection' | 'page';
export type TabName = 'Check' | 'Libraries';

export interface ScanResult {
  /** The scope actually scanned; an empty selection falls back to the page. */
  scope: ScanScope;
  pageName: string;
  scanned: number;
  findings: Finding[];
  /** Screen id -> name. */
  screens: Record<string, string>;
  summary: ScoreSummary;
  threshold: number;
}

export type MainToUi =
  | {
      type: 'init';
      tab: TabName;
      /** The token itself never goes back to the UI. */
      hasToken: boolean;
      teamLink: string;
      available: AvailableLibrary[];
      libraries: LibrarySummary[];
    }
  | { type: 'libraries'; hasToken: boolean; available: AvailableLibrary[]; libraries: LibrarySummary[] }
  | { type: 'scan-progress'; scanned: number }
  | { type: 'scan-result'; result: ScanResult }
  /** Something failed; the reason was already shown as a Figma notification. */
  | { type: 'error' };

export type UiToMain =
  | { type: 'ui-ready' }
  /** An empty token means "use the saved one". */
  | { type: 'load-team'; token: string; teamLink: string }
  | { type: 'add-library'; libraryId: string }
  | { type: 'set-library-use'; libraryId: string; use: LibraryUse }
  | { type: 'remove-library'; libraryId: string }
  | { type: 'scan'; scope: ScanScope; includeHidden: boolean }
  | { type: 'locate'; nodeId: string };
