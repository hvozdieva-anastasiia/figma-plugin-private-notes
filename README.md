# Personal Notes & Tasks

A Figma plugin for personal notes and tasks attached to the whole file, a page or a frame. You only see your own entries. Entries are stored inside the Figma file itself, so there is nothing to connect or sign in to: open the plugin and your notes are there.

The plugin UI is English only. Project documents are written in Russian: [architecture](docs/private-notes-architecture.md), [implementation plan](docs/private-notes-implementation-plan.md), [stage log](docs/private-notes/progress.md), [manual check protocol](docs/private-notes/manual-checks.md).

**Status: stages 1–8 are complete; the build is verified by automated tests and manually in Figma Desktop.** On November 20 the separation of entries between two real accounts in one Desktop client was confirmed separately. Independent clients have not been verified yet. The [publishing materials](docs/private-notes/publish/README.md) are prepared; the plugin has not been submitted for review.

## Development setup

Requires Node.js 24 and pnpm 11.25.0 (pinned in `packageManager`). Library versions are pinned in `package.json` and `pnpm-lock.yaml`; do not upgrade them during install.

```powershell
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` runs type checking, the linter, the formatting check, the tests and the build. The output is `dist/code.js` and `dist/index.html` (a single file with no external resources). If pnpm is not installed globally, `tooling/pnpm.ps1` runs it from the installed Node directory.

To load it in Figma Desktop: **Plugins → Development → Import plugin from manifest…** and select the root `manifest.json`. Then run **Plugins → Development → Personal Notes & Tasks**. The permanent plugin ID is stored in `manifest.json` and must not be changed: saved notes are tied to the plugin ID. If the ID ever has to be set again, use `pnpm plugin:id NUMERIC_ID` (see `tooling/plugin-id.mjs`).

## How to use

- **First row of the window:** search, a small "+" button (add a note) and a refresh button. Below are the "All / Notes / Open / Done" filters and the "All notes / Current selection" switch with a "Select" button.
- **Target** is chosen in the "Target" dropdown above the text: the selected frame (the default when exactly one frame is selected), the current page, "Whole file", or "Choose another page or frame…". The choice is fixed when the editor opens and changes only through this dropdown; canvas clicks and page changes do not affect it. Save with the "Save" button or Ctrl+Enter; Escape closes the editor (it asks for confirmation if text has been typed).
- **One list:** "Whole file", pages with their notes, and nested frames. Groups collapse, and headers show counts (a page counts its own notes and the notes of its frames, with no double counting). Names come from Figma, so a renamed frame, or one moved to another page, is shown correctly.
- **A task** differs from a note by a "done" checkbox; a completed task is not deleted.
- **Navigation:** the arrow next to a page or frame note switches to that page and reveals the frame. "Whole file" has no navigation.
- **Lost target.** If a page or frame is deleted, the note moves to "No available target" with its text intact. Nothing is erased, and it is never moved to "Whole file" automatically. The "Rebind" button opens the picker for a new target.
- **Bulk actions:** "Select" turns on selection mode (checkboxes appear on notes and groups). The bottom bar lets you select all visible entries, mark tasks done or reopen them, move them to another target, or delete them with confirmation. Each note is changed individually; if some fail, this is shown and the failed ones stay selected.
- **Handoff:** in the selection bar, "Copy as Markdown" copies the selected entries as Markdown (file, pages, frames, tasks as checkboxes). If the clipboard is unavailable, the text is shown for manual copying.
- **Smart Context:** the "Now:" line shows the selected frame (or the frame around the selected layer, otherwise the page) and how many entries are "here", including nested frames. "Current selection" shows only those; the chosen view is remembered.
- **Window size** is changed with the handle in the bottom-right corner (mouse or arrow keys; Shift for a larger step) and is remembered for the next launch.
- **Refresh.** The list is re-read with the refresh button and when you return to the plugin window. After Undo or Redo in Figma, the window shows the actual state of the document.

## Where notes are stored and what it means for privacy

- Each note is one `pluginData` key on the root of the Figma file (`private_notes_note_<author>_<id>`). Notes are saved and synced together with the file by Figma itself. The plugin has no separate database, no server and makes no network requests; disabling network access does not disable Figma's own sync. `clientStorage` holds only the window size and the chosen list view.
- **The author is determined automatically** from `figma.currentUser` in Plugin Main and verified on every read and write: by the key prefix and by the field inside the record. Window commands carry no author, so another person's entry cannot be read, changed or deleted through the plugin. Other people's text never appears in the plugin's replies to the window (automated tests check this).
- **Notes are not encrypted.** The plugin does not show other people's entries, but this does not protect the file's contents. A different plugin ID cannot read these keys with a plain `getPluginData`; a person with enough access can still obtain the data through export or the authorized REST API. See [Figma's warning](https://developers.figma.com/docs/plugins/api/properties/nodes-setplugindata/). Do not store passwords or secrets.
- The plugin saves entries in pluginData without creating layers, comments or mentions. Text is never written to logs. "Copy as Markdown" exports the selection to the system clipboard only on explicit user action. Deleting removes the current key, but Undo, version history and file copies may retain the earlier data.
- Edit access to the file is required to save. View-only mode is not supported.

## Limits and constraints

- Up to 4,000 characters per note and 500 notes per author per file; a record is at most 80 kB (Figma's limit per value is 100 kB, and a 4,000-character note takes about 16 kB at most).
- **Undo.** Figma reverts note changes made during one plugin run as a single step: one Ctrl+Z on the canvas can remove all notes from that session at once, and Ctrl+Shift+Z brings them back. After you return to the window it shows the actual state; if you were editing a note that disappeared, it offers to save its text as a new note.
- Two windows of the same user: different entries are independent; the revision detects a stale edit once the new state is visible locally. There is no atomic protection against simultaneous edits before sync between clients.
- Verified: Figma Desktop, and separation of entries between two real accounts in one client. Not verified: sync between independent clients, the browser client, files with hundreds of notes, and frames inside component instances. The new run is described in the manual protocol separately from the stage 8 checks.
- The "choose another target" picker shows only top-level frames of a page (up to 100 on request).
- Old Common Structurizer materials (`docs/architecture.md`, `implementation-plan.md`, `product-decisions.md`, `ui-scenarios.md`, `testing-plan.md`, the `native-comment-navigation` experiment) are marked as archive and do not apply to Personal Notes & Tasks.

## Development

- `pnpm dev` rebuilds the UI and plugin on changes; `pnpm build` creates `dist/`.
- `pnpm typecheck`: TypeScript 7 (`@typescript/native`) separately for the UI, the Figma sandbox, tooling and experiments. The `typescript` package in the dependencies is an alias of `@typescript/typescript6`, used only for the linter's JavaScript API; do not swap one for the other.
- `pnpm lint`, `pnpm format` / `pnpm format:check`, `pnpm test` / `pnpm test:watch`.
- Layout: `src/shared` (model, validation, protocol, grouping and selection), `src/plugin` (Plugin Main, the `figma.root` repository, the notes service, Figma access), `src/ui` (React: one reducer, one bridge, components), `tests/private-notes` (tests), `experiments/private-notes` (the stage 2 API probe, `pnpm probe:notes:build`).
- Project skills live in `.agents/skills/`; they are not modified during formatting.
