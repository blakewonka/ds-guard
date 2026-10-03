import { LoadingIndicator, MiddleAlign, Tabs } from '@create-figma-plugin/ui';
import { useEffect, useState } from 'preact/hooks';
import type { MainToUi, ScanResult, TabName } from '../shared/messages';
import type { AvailableLibrary, LibrarySummary } from '../shared/types';
import { CheckTab } from './CheckTab';
import { LibrariesTab } from './LibrariesTab';
import { send } from './send';

export type Busy = null | 'load' | 'add' | 'scan';

export function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<TabName>('Check');
  const [hasToken, setHasToken] = useState(false);
  const [teamLink, setTeamLink] = useState('');
  const [available, setAvailable] = useState<AvailableLibrary[]>([]);
  const [libraries, setLibraries] = useState<LibrarySummary[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [scanned, setScanned] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);

  useEffect(() => {
    window.onmessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage as MainToUi | undefined;
      if (!msg) return;
      switch (msg.type) {
        case 'init':
          setTab(msg.tab);
          setTeamLink(msg.teamLink);
          setHasToken(msg.hasToken);
          setAvailable(msg.available);
          setLibraries(msg.libraries);
          setReady(true);
          break;
        case 'libraries':
          setHasToken(msg.hasToken);
          setAvailable(msg.available);
          setLibraries(msg.libraries);
          setBusy(null);
          break;
        case 'scan-progress':
          setScanned(msg.scanned);
          break;
        case 'scan-result':
          setResult(msg.result);
          setBusy(null);
          break;
        case 'error':
          setBusy(null);
          break;
      }
    };
    send({ type: 'ui-ready' });
  }, []);

  if (!ready) {
    return (
      <MiddleAlign>
        <LoadingIndicator />
      </MiddleAlign>
    );
  }

  const check = (
    <CheckTab
      libraries={libraries}
      busy={busy}
      scanned={scanned}
      result={result}
      onScan={(scope, includeHidden) => {
        setBusy('scan');
        setScanned(0);
        send({ type: 'scan', scope, includeHidden });
      }}
      onOpenLibraries={() => setTab('Libraries')}
    />
  );
  const libs = (
    <LibrariesTab
      libraries={libraries}
      available={available}
      hasToken={hasToken}
      teamLink={teamLink}
      busy={busy}
      onLoad={(token, link) => {
        setBusy('load');
        send({ type: 'load-team', token, teamLink: link });
      }}
      onAdd={(libraryId) => {
        setBusy('add');
        send({ type: 'add-library', libraryId });
      }}
    />
  );

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as TabName)}
      options={[
        { value: 'Check', children: check },
        { value: 'Libraries', children: libs },
      ]}
    />
  );
}
