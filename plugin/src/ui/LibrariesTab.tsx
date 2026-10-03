import {
  Bold,
  Button,
  Container,
  Disclosure,
  Divider,
  Dropdown,
  IconButton,
  IconClose16,
  Muted,
  Stack,
  Text,
  Textbox,
  VerticalSpace,
} from '@create-figma-plugin/ui';
import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import type { AvailableLibrary, LibrarySummary, LibraryUse } from '../shared/types';
import type { Busy } from './App';
import { send } from './send';

const USE_OPTIONS: { value: LibraryUse; text: string }[] = [
  { value: 'approved', text: 'Approved' },
  { value: 'other-brand', text: 'Other brand' },
  { value: 'deprecated', text: 'Deprecated' },
];

interface Props {
  libraries: LibrarySummary[];
  available: AvailableLibrary[];
  hasToken: boolean;
  teamLink: string;
  busy: Busy;
  onLoad: (token: string, teamLink: string) => void;
  onAdd: (libraryId: string) => void;
}

export function LibrariesTab({ libraries, available, hasToken, teamLink, busy, onLoad, onAdd }: Props) {
  const [token, setToken] = useState('');
  const [link, setLink] = useState(teamLink);
  const [settingsOpen, setSettingsOpen] = useState(available.length === 0);

  const canLoad = (token !== '' || hasToken) && link.trim() !== '';
  const addable = available
    .filter((a) => !libraries.some((l) => l.libraryId === a.libraryId))
    .map((a) => ({ value: a.libraryId, text: `${a.name} (${a.componentCount})` }));

  return (
    <Fragment>
      <Disclosure title="Team" open={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}>
        <Stack space="extraSmall">
          <Text>
            <Muted>
              Libraries are read from your Figma team with a personal access token (scopes
              team_library_content:read, library_content:read and file_metadata:read). The token stays on this
              computer.
            </Muted>
          </Text>
          <Textbox
            password
            placeholder={hasToken ? 'Access token saved' : 'Figma access token'}
            value={token}
            onValueInput={setToken}
          />
          <Textbox placeholder="Team link" value={link} onValueInput={setLink} />
          <Button
            fullWidth
            secondary={available.length > 0}
            loading={busy === 'load'}
            disabled={busy !== null || !canLoad}
            onClick={() => {
              onLoad(token, link);
              setToken('');
            }}
          >
            {available.length > 0 ? 'Reload libraries' : 'Load libraries'}
          </Button>
        </Stack>
      </Disclosure>
      <Divider />
      <Container space="medium">
        <VerticalSpace space="small" />
        <Dropdown
          placeholder={
            available.length === 0
              ? 'Load a team to list its libraries'
              : addable.length === 0
                ? 'All team libraries are added'
                : `Add a library (${addable.length} available)`
          }
          disabled={busy !== null || addable.length === 0}
          options={addable}
          value={null}
          onValueChange={onAdd}
        />
        <VerticalSpace space="small" />
      </Container>
      <Divider />
      {libraries.length === 0 && (
        <Container space="medium">
          <VerticalSpace space="medium" />
          <Text align="center">
            <Muted>No libraries chosen yet</Muted>
          </Text>
        </Container>
      )}
      {libraries.map((library) => (
        <Fragment key={library.libraryId}>
          <Container space="medium">
            <VerticalSpace space="small" />
            <Stack space="extraSmall">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text>
                  <Bold>{library.name}</Bold>
                </Text>
                <IconButton
                  aria-label={`Remove ${library.name}`}
                  onClick={() => send({ type: 'remove-library', libraryId: library.libraryId })}
                >
                  <IconClose16 />
                </IconButton>
              </div>
              <Text>
                <Muted>
                  {library.componentCount} components · version {library.version} ·{' '}
                  {new Date(library.indexedAt).toLocaleDateString()}
                </Muted>
              </Text>
              <Dropdown
                options={USE_OPTIONS}
                value={library.use}
                onValueChange={(use) => send({ type: 'set-library-use', libraryId: library.libraryId, use: use as LibraryUse })}
              />
            </Stack>
            <VerticalSpace space="small" />
          </Container>
          <Divider />
        </Fragment>
      ))}
    </Fragment>
  );
}
