import {
  Banner,
  Button,
  Checkbox,
  Container,
  Disclosure,
  Divider,
  IconApprovedCheckmark16,
  IconDetach16,
  IconFrame16,
  IconInstance16,
  IconWarning16,
  Layer,
  Muted,
  SegmentedControl,
  Stack,
  Text,
  VerticalSpace,
} from '@create-figma-plugin/ui';
import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import type { ScanResult, ScanScope } from '../shared/messages';
import type { Finding, LibrarySummary, State } from '../shared/types';
import type { Busy } from './App';
import { send } from './send';

/** Findings shown as lists, most actionable first. Approved ones are only counted. */
const GROUPS: { state: State; label: string }[] = [
  { state: 'wrong-brand', label: 'Wrong brand' },
  { state: 'deprecated', label: 'Deprecated' },
  { state: 'unknown-library', label: 'Unknown library' },
  { state: 'local', label: 'Local component' },
  { state: 'missing', label: 'Missing component' },
  { state: 'detached', label: 'Detached' },
  { state: 'suspected-detach', label: 'Possibly detached (not scored)' },
  { state: 'exception', label: 'Exceptions (not scored)' },
];

// Rounded down, so only a fully approved screen ever reads 100%.
const percent = (value: number) => `${Math.floor(value * 100)}%`;

interface Props {
  libraries: LibrarySummary[];
  busy: Busy;
  scanned: number;
  result: ScanResult | null;
  onScan: (scope: ScanScope, includeHidden: boolean) => void;
  onOpenLibraries: () => void;
}

export function CheckTab({ libraries, busy, scanned, result, onScan, onOpenLibraries }: Props) {
  const [scope, setScope] = useState<ScanScope>('selection');
  const [includeHidden, setIncludeHidden] = useState(false);
  const hasApproved = libraries.some((l) => l.use === 'approved');

  if (!hasApproved) {
    return (
      <Container space="medium">
        <VerticalSpace space="medium" />
        <Stack space="medium">
          <Banner icon={<IconWarning16 />} variant="warning">
            Choose at least one approved library before checking.
          </Banner>
          <Button fullWidth onClick={onOpenLibraries}>
            Choose libraries
          </Button>
        </Stack>
      </Container>
    );
  }

  return (
    <Fragment>
      <Container space="medium">
        <VerticalSpace space="medium" />
        <Stack space="small">
          <SegmentedControl
            value={scope}
            onValueChange={(value) => setScope(value as ScanScope)}
            options={[
              { value: 'selection', children: 'Selection' },
              { value: 'page', children: 'Page' },
            ]}
          />
          <Checkbox value={includeHidden} onValueChange={setIncludeHidden}>
            <Text>Include hidden layers</Text>
          </Checkbox>
          <Button fullWidth loading={busy === 'scan'} disabled={busy !== null} onClick={() => onScan(scope, includeHidden)}>
            Check
          </Button>
          {busy === 'scan' && scanned > 0 && (
            <Text align="center">
              <Muted>{scanned} layers scanned…</Muted>
            </Text>
          )}
        </Stack>
        <VerticalSpace space="medium" />
      </Container>
      {result && <Results result={result} />}
    </Fragment>
  );
}

function Results({ result }: { result: ScanResult }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [located, setLocated] = useState<string | null>(null);
  const { summary, findings, screens } = result;

  const toggle = (id: string) => setOpen({ ...open, [id]: !open[id] });
  const locate = (nodeId: string) => {
    setLocated(nodeId);
    send({ type: 'locate', nodeId });
  };

  const approved = findings.filter((f) => f.state === 'approved').length;
  const passing = summary.screens.filter((s) => s.pass).length;
  const where = result.scope === 'selection' ? 'the selection' : `page “${result.pageName}”`;

  if (findings.length === 0) {
    return (
      <Fragment>
        <Divider />
        <Container space="medium">
          <VerticalSpace space="medium" />
          <Text align="center">
            <Muted>No components found in {where}</Muted>
          </Text>
        </Container>
      </Fragment>
    );
  }

  return (
    <Fragment>
      <Divider />
      <Container space="medium">
        <VerticalSpace space="medium" />
        <Stack space="extraSmall">
          {summary.pass ? (
            <Banner icon={<IconApprovedCheckmark16 />} variant="success">
              {percent(summary.coverage)} approved · all {summary.screens.length} screens pass
            </Banner>
          ) : (
            <Banner icon={<IconWarning16 />} variant="warning">
              {percent(summary.coverage)} approved · {passing} of {summary.screens.length} screens pass
            </Banner>
          )}
          <Text>
            <Muted>
              {approved} approved components in {where}. A screen passes only when every component is approved.
            </Muted>
          </Text>
        </Stack>
        <VerticalSpace space="medium" />
      </Container>
      <Divider />
      {GROUPS.map(({ state, label }) => {
        const group = findings
          .filter((f) => f.state === state)
          .sort((a, b) => (a.componentName ?? '').localeCompare(b.componentName ?? ''));
        if (group.length === 0) return null;
        return (
          <Disclosure key={state} title={`${label} (${group.length})`} open={open[state] === true} onClick={() => toggle(state)}>
            {group.map((f) => (
              <Layer
                key={f.nodeId}
                component={f.state !== 'detached' && f.state !== 'suspected-detach'}
                icon={f.state === 'detached' || f.state === 'suspected-detach' ? <IconDetach16 /> : <IconInstance16 />}
                description={describe(f, screens)}
                value={located === f.nodeId}
                onValueChange={() => locate(f.nodeId)}
              >
                {f.componentName ?? 'Unknown component'}
              </Layer>
            ))}
          </Disclosure>
        );
      })}
      <Disclosure title={`Screens (${summary.screens.length})`} open={open.screens === true} onClick={() => toggle('screens')}>
        {summary.screens.map((s) => (
          <Layer
            key={s.screenId}
            icon={<IconFrame16 />}
            description={`${percent(s.coverage)} · ${s.pass ? 'pass' : 'fail'}`}
            value={located === s.screenId}
            onValueChange={() => locate(s.screenId)}
          >
            {screens[s.screenId]}
          </Layer>
        ))}
      </Disclosure>
    </Fragment>
  );
}

function describe(f: Finding, screens: Record<string, string>): string {
  const screen = screens[f.screenId];
  return f.sourceLibrary ? `${f.sourceLibrary} · ${screen}` : screen;
}
