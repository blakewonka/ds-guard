# BirDS Guard — Figma Plugin Implementation Plan

Source: *Figma library compliance plugin plan.md* (research brief). This document turns that brief into a buildable plan.

## 1. What we are building

An internal Figma plugin that checks whether a selection, page, or prototype flow uses only **approved BirDS components** for a chosen brand, explains every deviation, and helps fix it.

**Core constraint that shapes everything:** the Plugin API cannot list enabled libraries or say which library a component came from. It only exposes a component's `key`, `remote` flag, and (for detached frames) `detachedInfo`. So "approved" is defined by **profiles** — curated, versioned manifests of component / component-set keys built by the DS team.

**Positioning vs. Figma Check designs (June 2026):** we do *not* compete on generic linting. We own: persistent versioned BirDS profiles, brand-aware (wrong-brand) checks, flow-level scope, exceptions with reasons, guided restore/relink, and a Dev Mode "build custom" view.

---

## 2. Phase 0 — Decisions & spikes (week 0–2)

### 2.1 Decisions needed from Ravan (DS owner) before build

| # | Decision | Affects | Default if no answer |
|---|---|---|---|
| D1 | Figma plan (Pro / Org / Enterprise) | Private org plugin distribution, `figma.fileKey`, Check designs, Library Analytics | Assume Organization |
| D2 | Profile source of truth: company endpoint vs. baked into plugin build | Hosting, CORS, update cadence | Endpoint + baked fallback |
| D3 | Check nested instances inside approved components? | False positives from BirDS internal composition | Only check top-level / designer-placed instances; nested inside approved = skipped |
| D4 | Do hidden layers and local components count? | Scan + score | Hidden: skip by default (setting). Local: count as violation |
| D5 | Score definition + pass threshold | Report | Instance-based coverage; screen pass ≥ 80% |
| D6 | Profiles per brand, per product, or both | Profile schema | Per brand, extensible to product |
| D7 | Who can create org-level exceptions | Admin UI / endpoint auth | DS team only (endpoint-side) |
| D8 | Flow checks gated by page or Ready-for-dev status | Flow UX | Ungated in MVP |

### 2.2 Technical spikes (prototype, 2 weeks)

Each spike produces a yes/no answer recorded in `docs/spikes.md`.

1. **Key parity** — does REST `/v1/files/:key/components` variant `key` equal plugin `ComponentNode.key`? Does component-set key match?
2. **Remote parent** — is `parent` (the component set) reliably populated on a remote main component from `getMainComponentAsync()`?
3. **detachedInfo durability** — survives duplicate? copy-paste within file? across files? nested-instance detach returns null?
4. **Dev Mode writes** — can a plugin in Dev Mode write annotations (docs conflict)?
5. **Performance** — scan time + memory on the largest real BirDS product file (target: 10K nodes < 5 s on a page).
6. **Check designs comparison** — run it on a real BirDS file; does it distinguish brands and persist library selection? (Strategic go/no-go: if yes, shrink scope to exceptions + flow + restore + Dev view.)

---

## 3. Architecture

```
┌────────────────────── Figma ──────────────────────┐
│  main thread (code.ts)          UI iframe (ui.tsx)│
│  ─ scanner                       ─ profile picker │
│  ─ classifier          ⇄ msgs ⇄  ─ results/report │
│  ─ indexer (DS mode)             ─ restore preview│
│  ─ restore / relink              ─ fetch() profiles
│  ─ storage (clientStorage,       │   (network)    │
│     pluginData on root/nodes)    │                │
└──────────────────────────────────┼────────────────┘
                                   │ HTTPS, CORS *
                     ┌─────────────▼─────────────┐
                     │ BirDS profile service     │
                     │  GET /profiles            │
                     │  GET /profiles/:id@:ver   │
                     │  GET /manifests/:lib@:ver │
                     │  POST /manifests (DS auth)│
                     │  (optional REST indexer   │
                     │   job on library publish) │
                     └───────────────────────────┘
```

**Stack:** TypeScript, esbuild (two bundles: `code.js`, `ui.html` with inlined JS), Preact or React for UI, Vitest for unit tests of the pure classifier/scorer logic. Profile service: small Node/Edge function + static JSON in object storage (manifests are immutable per version, so they can be CDN-cached).

### 3.1 manifest.json

```jsonc
{
  "documentAccess": "dynamic-page",
  "editorType": ["figma", "dev"],
  "capabilities": ["inspect"],
  "permissions": ["currentuser"],
  "networkAccess": { "allowedDomains": ["https://birds-profiles.<company>.az"] },
  "relaunchButtons": [{ "command": "check", "name": "Check BirDS compliance" }],
  "parameters": [ /* quick action: "Check selection" / "Check page" */ ]
}
```

### 3.2 Repository layout

```
birds-guard/
  plugin/
    manifest.json
    src/
      main/                 # runs in Figma sandbox
        index.ts            # command router (check, index-library, relaunch)
        scan/traverse.ts    # findAllWithCriteria, chunked + yielding
        scan/resolve.ts     # getMainComponentAsync w/ cache by id
        scan/flow.ts        # flowStartingPoints → reactions graph walk
        classify.ts         # pure: node facts + profile → state
        score.ts            # pure: findings → screen/flow scores
        indexer.ts          # "Index this library" (DS mode)
        fix/restore.ts      # detached frame → instance (V2)
        fix/relink.ts       # swapComponent via mapping table (V2)
        storage/client.ts   # clientStorage pointer + manifest cache
        storage/file.ts     # root pin, node exceptions, snapshots (pluginData)
        navigate.ts         # locate node in canvas
        devmode.ts          # read-only guard
      ui/
        App.tsx
        screens/ProfilePicker.tsx, Results.tsx, Detached.tsx,
                RestorePreview.tsx, Exceptions.tsx, IndexLibrary.tsx, DevView.tsx
        api/profiles.ts     # fetch + version check + fallback
      shared/
        types.ts            # Profile, Manifest, Finding, Exception, messages
        messages.ts         # typed main⇄ui protocol
      fallback/profiles.json  # baked offline snapshot
    test/                   # Vitest on classify/score/flow graph
  service/                  # profile endpoint + optional REST indexer job
  docs/spikes.md
```

---

## 4. Data model (`shared/types.ts`)

```ts
type LibraryRole = 'core' | 'brand' | 'deprecated';

interface Manifest {            // one per library version
  libraryId: string;            // "birds-core"
  name: string; brand?: string; role: LibraryRole;
  version: number; indexedAt: string;
  components: Record<string /*key*/, { name: string; setKey?: string }>;
  componentSets: Record<string /*key*/, { name: string }>;
}

interface Profile {
  id: string;                   // "brand-a-product"
  name: string; version: number;
  approvedLibraries: string[];  // ["birds-core@14", "birds-brand-a@9"]
  otherBrandLibraries: string[];// for wrong-brand detection
  deprecatedLibraries: string[];
  orgExceptions: { key: string; reason: string }[]; // annotation kits, device frames
  mapping: Record<string /*fromKey*/, string /*toKey*/>; // legacy/wrong-brand → approved
  threshold: number;            // 0.8
}

type State = 'approved' | 'wrong-brand' | 'deprecated' | 'unknown-library'
           | 'local' | 'missing' | 'detached' | 'suspected-detach' | 'exception';

interface Finding {
  nodeId: string; pageId: string; screenId: string; // top-level frame
  state: State; componentKey?: string; componentName?: string;
  sourceLibrary?: string;       // from manifest lookup
  confidence: 'certain' | 'suspected';
  fixes: ('restore' | 'relink' | 'mark-exception' | 'request-change')[];
}
```

**Storage map**

| What | Where | Key |
|---|---|---|
| Selected profile pointer `{profileId, version}` | `clientStorage` | `birds.selection` |
| Cached profiles + manifests | `clientStorage` (≤5 MB) | `birds.cache.<id>@<ver>` |
| User settings (skip hidden, live rescan) | `clientStorage` | `birds.settings` |
| File pin (`profileId`) | `figma.root.setPluginData` | `birds.pin` |
| Node exception `{reason, by, at}` | `node.setPluginData` | `birds.exception` |
| Scan snapshot summary | root pluginData (chunked if >100 kB) or native annotation | `birds.snapshot.<ts>` |

Profile resolution order on launch: **file pin → clientStorage pointer → ask user**. Manifests: cache hit on matching version → else fetch → else baked fallback (with "offline / possibly stale" banner).

---

## 5. Classification logic (pure, unit-tested)

For each `INSTANCE`:
1. `main = await getMainComponentAsync()` (cached by `mainComponent.id`).
2. `main == null` or removed → **missing**.
3. If node has `birds.exception` pluginData or key ∈ `orgExceptions` → **exception** (excluded from score, listed).
4. `!main.remote` → **local**.
5. Lookup `main.key`, then `main.parent?.key` (component set) against:
   approved manifests → **approved**; other-brand → **wrong-brand**; deprecated → **deprecated**; none → **unknown-library**.
6. If D3 = "skip nested": don't descend into children of an approved instance.

For each `FRAME`:
- `detachedInfo` present → **detached** (certain). Resolve original: `library` → key lookup in manifests (tells "detached from approved Primary Button" vs. from other); `local` → componentId.
- No `detachedInfo` but name matches a manifest component name → **suspected-detach** (shown separately, never scored).

Score: `coverage = approved / (approved + violations)` per screen (excluding exceptions & suspected); screen passes if `coverage ≥ profile.threshold`. Flow/page score = % passing screens.

---

## 6. Milestones

### M1 — Foundation (week 2–3)
- Scaffold repo, esbuild, typed message bus, manifest.json, CI (lint, typecheck, Vitest).
- `shared/types.ts`, `classify.ts`, `score.ts` with fixtures-based tests.
- Dev Mode guard: in `figma.editorType === 'dev'`, all mutating commands disabled.

### M2 — Indexer & profile service (week 3–5)  *MVP*
- **In-file indexer** (DS mode): walk local `COMPONENT` / `COMPONENT_SET`, collect keys + names, `getPublishStatusAsync()` → warn on `UNPUBLISHED`/`CHANGED` before export; output manifest JSON; upload (DS auth token entered in service UI, not stored in plugin) or download for manual upload.
- **Profile service**: static JSON + versioned endpoints, CORS `*`, admin page to compose profiles from manifests, set threshold, org exceptions, mapping table.
- Baked `fallback/profiles.json` generated at plugin build time.

### M3 — Profile selector & persistence (week 5–6)  *MVP*
- First-run picker (profiles, not libraries); pin-to-file toggle; JSON export/import of selection.
- Version check on launch → refresh cache; stale/offline banner.
- `setRelaunchData` on root ("Check BirDS compliance") when the user has edit access.

### M4 — Scanner & results (week 6–8)  *MVP*
- Scopes: selection (default) → current page fallback. Whole-file opt-in, page by page with progress + cancel.
- `findAllWithCriteria({types:['INSTANCE','FRAME']})`, chunk of ~500 nodes then `await` yield; `skipInvisibleInstanceChildren` driven by setting.
- Results UI: scope header (file, page/frames, profile@version, user, timestamp) → scores → violations grouped by state then component → exceptions → suspected.
- Click-to-locate: `getNodeByIdAsync` → `setCurrentPageAsync` → select → `scrollAndZoomIntoView`.
- Optional debounced rescan on `selectionchange`.

### M5 — Exceptions (week 8–9)  *MVP*
- "Mark intentional" with reason: missing variant / edge case / experiment / annotation-only / other(text). Stored on node pluginData with user + date.
- Bulk mark per component group. Remove exception. Org exceptions shown read-only.
- **MVP release**: internal org plugin, pilot with 3–5 product designers on one brand.

### M6 — Restore & relink (V2, week 10–13)
- Detached groups by `detachedInfo.componentKey` ("12 × Primary Button").
- **Restore preview**: lists text/fill overrides we can reapply, overrides that will reset, incoming prototype reactions that will break (scan page reactions targeting frame id), layer names/plugin data lost.
- Restore: `importComponentByKeyAsync` → `createInstance()` → insert at same parent+index → copy x/y, constraints, layout sizing → reapply text content by matching layer path → remove frame → `figma.commitUndo()` once per batch. Fails gracefully if unpublished/inaccessible.
- **Relink** wrong-brand/legacy instances via `profile.mapping` + `swapComponent` (preserves overrides).
- "Request change" → link to BirDS intake with prefilled component + reason.

### M7 — Flow scope & reporting (V2, week 13–15)
- Pick from `page.flowStartingPoints`; BFS over `reactions[].actions[]` (`NODE` navigate/overlay/swap destinations) to collect reachable top-level frames; screen list worst-first; pass/fail.
- Snapshot: summary JSON in root pluginData + optional native annotation ("DS compliance" category) beside Ready-for-dev section.
- CSV/JSON export for DS rollups.

### M8 — Dev Mode view (V2, week 15–16)
- Read-only inspect panel: brand per component, "build custom" list (detached, local, unknown, missing). No writes besides pluginData/relaunchData if allowed.

### Later
REST "from file X" lookup for unknown keys (service-side, token never in plugin) · slot `limitViolations` checks · suspected-detach heuristics tuning · Library Analytics overlay · REST comments · auto re-index job on library publish (webhook `LIBRARY_PUBLISH`).

---

## 7. Testing strategy

- **Unit (Vitest):** classify, score, flow graph walk, profile resolution order, mapping lookups — all with JSON fixtures; no Figma runtime needed.
- **Fixture Figma file** ("BirDS Guard QA"): one frame per state (approved, wrong-brand, deprecated, unknown, local, missing, detached-library, detached-local, nested detach, pre-2023 detach, exception, hidden instance) + a 6-screen prototype flow with overlays. Expected results stored in `test/expected.json`; manual run checklist per release.
- **Performance:** benchmark on largest BirDS product file each release; record in `docs/perf.md`.
- **Pilot metrics:** false-positive reports, "unknown library" rate (proxy for profile staleness), restore undo rate.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Profile staleness → "unknown library" erodes trust | Re-index tied to publish (checklist → later webhook job); show manifest age; "report false positive" button |
| Restore damages overrides / prototype links | Preview-and-confirm only, single undo step, never silent bulk; prefer relink where mapping exists |
| detachedInfo gaps (pre-Sep-2023, nested) | Label as "suspected", exclude from score |
| clientStorage not shared across devices/apps | Small pointer only; file pin + endpoint are authoritative |
| Large file performance | Selection/page default, chunked yielding, main-component cache, cancel button |
| Figma ships brand-aware Check designs | Spike #6 decides scope; differentiators (exceptions, flow, restore, Dev view) remain |
| Endpoint unavailable / not approved by IT | Baked fallback profiles in plugin build |

## 9. Immediate next steps

1. Get answers for D1, D2, D3, D5 from Ravan.
2. Run Check designs on a real BirDS file (spike #6) — go/no-go on full scope.
3. Scaffold the repo (M1) and build the indexer spike against BirDS Core to verify key parity (spikes #1–#2).
