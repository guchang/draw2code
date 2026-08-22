# Draw2Code

[中文](README.md) | English

Draw2Code is a human-AI collaborative prototyping plugin for [DeepSeek Harness (DSH)](https://github.com/DeepSeek-AI/DeepSeek-Harness). It helps users clarify a product idea, co-edit a semantic low-fidelity prototype on an Excalidraw canvas, and generate frontend pages only after the prototype has been reviewed.

## Product flow

1. **Create** — `draw2code_create` asks choice-first questions about the target platform, users, goal, core flow, modules, and first pages. It does not create a board until the final brief is confirmed.
2. **Update** — `draw2code_update` writes to an editable Excalidraw board, protects manual edits and deletions, validates layout quality, verifies the disk write, and automatically reveals the updated board in DSH.
3. **Generate** — `draw2code_generate` reads the latest board, lets the user choose page scope and visual direction, blocks incomplete prototypes, translates prototype facts into responsive Grid/Flex layouts instead of copying canvas coordinates, and verifies workspace screenshot/DOM artifacts, hashes, viewport sizes, and preserved unselected page blocks before completion.

## Highlights

- Full Excalidraw canvas inside `dsh-better-sidebar`;
- multiple boards, history, export, and workspace-local persistence;
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
- `dsh-better-sidebar` 0.12.3 or newer.

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

Draw2Code writes only to the current registered DSH workspace:

- `draw2code/*.excalidraw.json` — editable boards;
- `draw2code/.projects/` — product briefs and revisions;
- `draw2code/.generations/` — resumable generation sessions;
- `draw2code/.generate-settings/` — project visual direction;
- `draw2code-pages/<board>/index.html` — generated frontend demos.

Workspace access is gated by the DSH workspace registry. The HTTP API is loopback/same-origin only, risky overwrites require confirmation, and board updates use atomic writes plus read-back verification.

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
