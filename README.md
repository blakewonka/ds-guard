# BirDS Guard

A Figma plugin that checks whether a design uses only components from approved BirDS libraries, and shows exactly where it does not.

Pick the libraries that count as approved for your product, select a frame or a page, and press **Check**. Every component that comes from the wrong brand, a deprecated library, an unknown library, a local copy, or a detached frame is listed, and clicking a row takes you to that layer on the canvas.

## Why

Figma's Plugin API cannot tell a plugin which libraries a file uses or which library a component came from. BirDS Guard works around this by reading the published component keys of each library through Figma's REST API and comparing every instance on the canvas against them. "Approved" is therefore your own explicit choice of libraries, not whatever happens to be enabled in a file, which is what makes wrong-brand detection possible.

## What it checks

Each component instance in the scanned area is put into one of these groups:

| Group | Meaning |
|---|---|
| Approved | Comes from a library you marked **Approved** |
| Wrong brand | Comes from a library you marked **Other brand** |
| Deprecated | Comes from a library you marked **Deprecated** |
| Unknown library | Comes from a library that is not in your list |
| Local component | Defined in the file itself, including pasted copies |
| Missing component | The main component was deleted or cannot be found |
| Detached | A frame that was detached from a component (uses Figma's `detachedInfo`) |
| Possibly detached | A plain frame whose name matches an approved component. Listed, never scored |
| Exceptions | Layers marked as intentional. Listed, never scored |

**Scoring.** A screen is a top-level frame on the page or in a section. A screen passes only when 100% of its counted components are approved. The result shows the approved share, how many screens pass, and a list of screens with the worst first.

**Scope.** The current selection, or the whole current page when nothing is selected. Hidden layers are skipped unless you tick **Include hidden layers**.

## Requirements

- Figma desktop app (plugins in development cannot be loaded in the browser)
- Node.js 22 or newer
- A Figma personal access token with these scopes:
  - `team_library_content:read`
  - `library_content:read`
  - `file_metadata:read`
- Access to the Figma team that owns the BirDS libraries

## Install

```bash
git clone https://github.com/blakewonka/ds-guard.git
cd ds-guard/plugin
npm install
npm run build
```

Then, in the Figma desktop app:

1. Open any design file.
2. Go to **Plugins → Development → Import plugin from manifest…**
3. Choose `plugin/manifest.json`.

## How to use

### 1. Choose your libraries (once)

1. Run **Plugins → Development → BirDS Guard → Choose libraries**.
2. Open the **Team** section at the top of the **Libraries** tab.
3. Paste your Figma access token in the first field.
4. Paste your team link in the second field. Any link that contains `/team/<number>` works, for example `https://www.figma.com/files/team/1234567890/all-projects`.
5. Press **Load libraries**. The plugin lists every published library in the team.
6. Pick libraries from the **Add a library** dropdown.
7. For each library, choose how it is treated: **Approved**, **Other brand**, or **Deprecated**.

Your token, team link and chosen libraries are remembered on your computer for every file you open. Press **Reload libraries** after a library is published again, so the plugin picks up new components.

### 2. Check a design

1. Run **Plugins → Development → BirDS Guard → Check compliance**.
2. Choose **Selection** or **Page**.
3. Press **Check**.
4. Open a group, such as **Wrong brand**, and click a row to jump to that layer.

A green banner means every screen passed. A yellow banner shows the approved share and how many screens passed.

## Limitations

- **Nested components are not checked.** An instance is treated as one unit; components inside it, including ones a designer swapped inside an approved instance, are not inspected.
- **One page at a time.** Whole-file scans are not available yet.
- **Exceptions cannot be created yet.** The scan honours layers marked as intentional, but the action to mark them is not built.
- **Detach detection has gaps.** Frames detached before September 2023, and some frames detached from nested instances, carry no record and can only appear as "possibly detached".
- **Outdated instances are not detected.** The plugin cannot tell whether an instance is behind the latest published version of its component.
- **Library names need `file_metadata:read`.** Without it a library is shown as "Library" followed by its file key.

## Privacy and security

- The access token is stored unencrypted in the plugin's local storage (`figma.clientStorage`) on your computer. It is never sent back to the plugin's panel after saving.
- The plugin makes network requests only to `https://api.figma.com`.
- Nothing is written to the file being checked.

## Development

All commands run in `plugin/`.

| Command | What it does |
|---|---|
| `npm run build` | Builds `dist/code.js`, `dist/ui.html` and the browser preview `dist/preview.html` |
| `npm run watch` | Rebuilds on change (unminified) |
| `npm run typecheck` | Type-checks with TypeScript |
| `npm test` | Runs the unit tests (Vitest) |
| `npm run check` | Typecheck, tests and build together |

After a build, close and reopen the plugin in Figma to load the new version.

**Browser preview.** `dist/preview.html` runs the panel against mock data, without Figma. Serve `plugin/dist` with any static server and open `preview.html`. Add `?libraries` to open the Libraries tab, `?empty` for the first-run state, and `?theme=dark` for the dark theme. Nothing typed there reaches Figma.

### Project layout

```
plugin/
  manifest.json          Figma plugin manifest
  build.mjs              esbuild script; inlines JS and CSS into ui.html
  src/
    main/                Runs in Figma's sandbox
      index.ts           Message router
      rest.ts            Figma REST API calls (team components, file names)
      libraries.ts       Manifest building, link parsing, local profile (pure)
      classify.ts        Instance and frame classification (pure)
      score.ts           Per-screen scoring (pure)
      scan.ts            Canvas traversal
      navigate.ts        Click-to-locate
      storage.ts         clientStorage read and write
    ui/                  The panel (Preact)
    shared/              Types and the main ⇄ UI message protocol
  test/                  Unit tests and the preview mock
PLAN.md                  Implementation plan and roadmap
```

### UI

The panel is built with [`@create-figma-plugin/ui`](https://github.com/yuanqing/create-figma-plugin), a Preact component library that replicates Figma's own UI, and Figma's `--figma-color-*` theme tokens, so it follows the light and dark themes.

Figma renders plugin UI in quirks mode, where CSS class names are case-insensitive. The build therefore keeps full CSS class names instead of minifying them; do not turn identifier minification on.

## Roadmap

See [PLAN.md](PLAN.md). Next up: marking exceptions with a reason, guided restore of detached frames, relinking wrong-brand instances to their approved equivalent, checking a whole prototype flow, and a read-only view for developers in Dev Mode.
