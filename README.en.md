# Draw2Code

[中文](README.md) | English

Draw2Code is a human-AI collaborative prototyping tool for DSH, Codex, and other MCP agents. It helps users clarify a product idea, co-edit a semantic low-fidelity prototype on a shared Excalidraw canvas, and generate frontend pages only after the prototype has been reviewed.

## Product flow

1. **Create** — `draw2code_create` extracts explicit facts, then lets the Agent ask adaptive, product-specific questions about the highest-impact scenario, differentiation, loop, risk, or first-version proof. Users can skip one question, synthesize immediately, or reopen only the affected decision after reviewing the brief. It stops when the product is clear (at most ten lifetime questions), deterministically renders one structured `PrototypeBrief` as a complete executable Markdown brief, and shows a final card listing every page to be drawn before creating a board.
2. **Open & Demonstrate** — when users want to sketch for the Agent, `draw2code_open` hands a short-lived canvas URL to the host sidebar without entering Create. “I’m done drawing” routes to `draw2code_read`, which summarizes the visible board before any requested update or generation.
3. **Update** — `draw2code_update` writes to an editable Excalidraw board, protects manual edits and deletions, validates layout quality, verifies the disk write, and automatically reveals the updated board in DSH.
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

Start a new Codex task after installation. Users invoke it with natural language such as “Use Draw2Code to design a habit tracker”, “Open Draw2Code; I want to sketch it myself”, or an explicit request to draw a prototype. A generic app coding request does not activate Draw2Code.

The bundled Skill drives six stable MCP tools. `draw2code_open` prefers MCP UI, supports `presentation=handoff` for a host-owned sidebar browser, falls back to an external local browser, and returns a link in headless environments. URL readiness is not reported as visible until the host has actually shown the canvas. DSH and Codex connect to the same on-demand loopback daemon and edit the same in-place workspace files.

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

Workspace roots are canonicalized and gated by HostContext. The daemon listens only on loopback, uses a private `0600` descriptor and random bearer token, and gives canvases short-lived scoped tokens. Risky overwrites require confirmation, while board updates use atomic writes plus read-back verification.

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
