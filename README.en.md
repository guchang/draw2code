# Draw2Code

[中文](README.md) | English

Draw2Code is a human-AI collaborative prototyping tool for DSH, Codex, and other MCP agents. It helps users clarify a product idea, co-edit a semantic low-fidelity prototype on a shared Excalidraw canvas, and generate frontend pages only after the prototype has been reviewed.

## Product flow

1. **Create** — `draw2code_create` extracts explicit facts, then lets the Agent ask adaptive, product-specific questions about the highest-impact scenario, differentiation, loop, risk, or first-version proof. Users can skip one question, synthesize immediately, or reopen only the affected decision after reviewing the brief. It stops when the product is clear (at most ten lifetime questions), deterministically renders one structured `PrototypeBrief` as a complete executable Markdown brief, and shows a final card listing every page to be drawn before creating a board.
2. **Open & Demonstrate** — users can open `http://127.0.0.1:64775/` directly; Draw2Code restores a locally registered workspace without requiring a prior Codex connection. A focused `$draw2code-open` fast path calls `draw2code_open` exactly once without loading Create, Update, Generate, representative-page review, or prototype quality gates. Its short-lived targeted handoff only binds the current task's workspace and board to that browser tab, then redirects to the stable bookmarkable root. “I’m done drawing” routes to `draw2code_read`, which summarizes the visible board before any requested update or generation.
3. **Update** — `draw2code_update action=write` writes to an editable Excalidraw board, protects manual edits and deletions, validates only the affected page for a small update, verifies the disk write, and returns an opaque `reviewToken`. `draw2code_read` defaults to a bounded page index and can select elements by page ids, element ids, canvas region, or a recent revision. Capacity reports canonical content, persisted formatting, inline assets, element count, and gzip checkpoint/delta history separately. The default operation-batch budget is 500 ops / 512 KiB (`reduce_batch_size`). The board has no normal product quota: 32 MiB only marks it as large, while 256 MiB and 50,000 elements are configurable anomaly fuses. `action=review` records a visible-canvas review without changing the board revision or publishing another reveal. For three or more pages, Create returns a structured `drawingPlan` that allows only the representative page first. If an agent still submits the remaining pages too early, Update preserves that payload behind a `pendingUpdateId`; after representative review, `action=commit_pending` applies it without regenerating or resending the large JSON batch.

The independent controls are `DRAW2CODE_MAX_SCENE_BYTES`, `DRAW2CODE_SOFT_SCENE_BYTES`, `DRAW2CODE_MAX_ELEMENTS`, `DRAW2CODE_MAX_OPS_BYTES`, `DRAW2CODE_MAX_OPS`, and `DRAW2CODE_MAX_VERSION_STORAGE_BYTES`. They are anomaly fuses and transport budgets, not product-plan quotas.
4. **Generate** — before `draw2code_generate` starts, the Agent asks in ordinary chat whether the user has a visual reference image. It then reads the latest board, lets the user choose page scope, recommends a visual direction from the reference or product semantics, blocks incomplete prototypes, translates prototype facts into responsive Grid/Flex layouts instead of copying canvas coordinates, and verifies workspace screenshot/DOM artifacts, hashes, viewport sizes, and preserved unselected page blocks before completion.

## Highlights

- Full Excalidraw canvas inside `dsh-better-sidebar`;
- multiple boards, history, export, workspace-local persistence, and explicit switching between locally registered workspaces in the standalone canvas;
- structured, resumable Create and Generate flows;
- conflict-aware human/agent co-editing;
- automatic reveal of the target board after a verified update;
- frame-free new pages built from semantic rectangle shells, external page labels, freely editable components, and unclipped hand-drawn cross-page arrows, while legacy named Frames remain compatible;
- quality gates for text sizing, page bounds, bottom navigation, bound labels, mock data, and repeated content;
- 153 embedded prototyping assets, available offline after installation;
- no bundled demo projects and no external upload of workspace data.

## Requirements

- DeepSeek Harness with a working `dsh web` profile;
- Node.js 22 or newer;
- `dsh-better-sidebar` 0.12.3 or newer for the DSH host. Codex runs independently and does not require DSH.

## Use from Codex

The first release is installed from a local personal marketplace and is not submitted to the public Plugin Directory:

```bash
codex plugin add draw2code@personal
```

Start a new Codex task after installation. Select the **Open Draw2Code / 画码** fast path, or say “Open Draw2Code”, for the single-purpose Open flow. Product requests such as “Use Draw2Code to design a habit tracker” or an explicit request to draw a prototype use the full workflow. A generic app coding request does not activate Draw2Code.

The bundled Skills drive six stable MCP tools. MCP startup prewarms a fixed loopback gateway and an on-demand worker. A local browser can open `http://127.0.0.1:64775/` directly: the gateway creates an internal `HttpOnly`, `SameSite=Strict` session, restores the most recent registered workspace, and protects writes with a same-origin CSRF token. Users do not have to understand or maintain a session. `draw2code_open` still defaults to `presentation=handoff` and returns a short-lived targeted URL so concurrent Codex tasks can bind different workspaces and boards to different tabs. The browser immediately returns to the clean root, leaving no workspace path, board name, token, or code in the bookmarkable address. Refreshing the fixed address recovers after either a gateway or worker restart. `localhost` permanently redirects to the canonical `127.0.0.1` origin. The plugin does not register a static embedded output template; an external local browser is used only when explicitly requested. A fixed-port conflict is reported explicitly instead of silently choosing another port. URL readiness is not reported as visible until the host has actually shown the canvas. DSH and Codex edit the same in-place workspace files.

Draw2Code registers its board inside the right sidebar provided by `dsh-better-sidebar`. DSH currently activates only bundles installed as direct profile dependencies, not another plugin's transitive dependencies, so both install commands below are required.

## Install from GitHub

Tested host and browser bundles are committed, so end users do not need to build locally:

```bash
dsh plugin --profile web add dsh-better-sidebar
dsh plugin --profile web add github:guchang/draw2code#v0.1.2
dsh web
```

On a brand-new DSH web profile, pnpm may pause the native `node-pty` build and add a pending entry to `$DSH_HOME/profiles/web/pnpm-workspace.yaml` (normally `~/.dsh/profiles/web/pnpm-workspace.yaml`). Allow that DSH runtime dependency, then rerun the install command:

```yaml
allowBuilds:
  node-pty: true
```

This authorizes a first-party DSH runtime build; Draw2Code itself does not run an install script.

Restart an existing `dsh web` process before the last command. Refresh the page, open the right-sidebar `+` menu, and choose **画码**.

Then start with a normal product request, for example:

```text
I want to create a new habit tracking app.
```

### Install from source

```bash
git clone https://github.com/guchang/draw2code.git
cd draw2code
npm ci
npm test

dsh plugin --profile web add dsh-better-sidebar
dsh plugin --profile web add link:$(pwd)
```

## Workspace data

Draw2Code writes only to the current host-registered workspace:

- `draw2code/*.excalidraw.json` — editable boards;
- `draw2code/.projects/` — product briefs and revisions;
- `draw2code/.generations/` — resumable generation sessions;
- `draw2code/.generate-settings/` — project visual direction;
- `draw2code-pages/<board>/index.html` — generated frontend demos.

Workspace roots are canonicalized and gated by HostContext. Both the stable gateway and dynamic worker listen only on loopback and use private `0600` descriptors. The direct local entry creates an internal `HttpOnly`, `SameSite=Strict` browser session and uses a same-origin CSRF token for writes. A one-time code is retained only for targeted Codex task/tab isolation; the clean final URL contains no root, board, token, or code, while the gateway privately manages short-lived workspace-scoped worker grants. Risky overwrites require confirmation, while board updates use atomic writes plus read-back verification.

The standalone canvas remembers only workspaces explicitly registered by Codex, DSH, another host, or the user. Its workspace menu shows the current root plus other roots that already contain boards, including each name, path, and board count; plugin caches and empty roots stay out of the picker. Switching first flushes pending edits and exchanges the current credential for a new token scoped to the selected root; the old token cannot directly read that root. Draw2Code does not scan the whole machine or automatically copy, merge, or migrate boards between workspaces.

## Development

```bash
npm ci
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

See [BDD.md](BDD.md), [GENERATE_PRODUCT_FLOW.md](GENERATE_PRODUCT_FLOW.md), and [features/draw2code.feature](features/draw2code.feature) for the product contracts.

## License

Draw2Code is licensed under the [Apache License 2.0](LICENSE). Embedded Excalidraw libraries remain under their upstream MIT License; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution and sources.
