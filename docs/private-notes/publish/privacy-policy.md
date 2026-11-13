# Privacy Policy — Personal Notes & Tasks (Figma plugin)

_Last updated: 2026-11-13_

Personal Notes & Tasks is a Figma plugin that stores personal notes and tasks inside
the Figma file you are working in. This policy describes exactly what the
plugin reads, writes, and never does. It reflects the shipped code, not a
template.

## What the plugin stores

| Data                                                                                               | Where it lives                                                                                                         | Who can see it via the plugin   |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Your notes and tasks (text, kind, open/done status, target, timestamps, internal revision counter) | The Figma file's own plugin data (`pluginData` on the document root), one record per note, keyed by your Figma user ID | Only you, in your plugin window |
| Plugin window size and your list view preference ("All notes" / "Current selection")               | `figma.clientStorage` on your machine                                                                                  | Only you                        |
| Your Figma user ID                                                                                 | Read from `figma.currentUser.id` at runtime to namespace your records; used in storage keys                            | Used internally only            |

A note record contains: note ID, your Figma user ID (as author), kind
(note/task), text, task status, the target (file / page ID+name / frame
ID+name+page), timestamps, and a revision counter.

## What the plugin reads from Figma

- `figma.currentUser.id` — to scope your notes to you (declared as the
  `currentuser` permission in the manifest).
- Page and frame IDs and names — only the ones needed to resolve, list, and
  navigate to note targets you chose. The document tree is not scanned;
  targets are looked up by ID on demand and in bounded batches.
- The current page and current selection — to show the "Now:" context line
  and the "Current selection" scope.

## What the plugin never does

- **No network access.** The manifest declares `allowedDomains: ["none"]`.
  The plugin makes no HTTP requests, opens no sockets, sends no analytics,
  telemetry, or crash reports. Nothing leaves the file or your machine.
- **No third parties.** There is no backend, no account system, no external
  database, no CDN, no tracking pixel.
- **No document mutation beyond its own storage keys.** The plugin creates no
  layers, comments, mentions, or shared/plugin-visible content in the file.
- **No logging of note contents.** The code contains no calls that write note
  text to consoles or logs.
- **No cookies, no localStorage tracking.** `clientStorage` holds only the
  window size and the list-scope toggle.

## Who can see your notes — the honest version

- Through the plugin, notes are visible only to the Figma account that wrote
  them. Every read and every write is scoped to the current user ID taken
  from Figma at runtime; other users' records are never read or sent to your
  window.
- **Notes are not encrypted.** They are stored as plugin data inside the
  file. Figma's plugin data is a storage mechanism, not a secrets container:
  another plugin, or code with access to the file via the Figma API, could
  technically read values stored under this plugin's keys. Do not store
  passwords, credentials, personal data of third parties, or other secrets
  in notes.
- Notes travel with the file through Figma's normal sync and backup
  mechanisms. Anyone who can open the file in Figma sees their own notes
  only — yours remain invisible to them inside this plugin.

## Data retention and deletion

- Deleting a note in the plugin removes its stored record immediately.
- Deleting the Figma file deletes all notes stored in it.
- Uninstalling the plugin does not delete notes already stored in files;
  they remain inside those files' plugin data.
- `clientStorage` entries (window size, list view preference) can be cleared
  by removing the plugin's local storage or reinstalling.

## Changes

This policy is updated when the storage behavior changes. The version in
force is the one shipped with the plugin source repository.

## Contact

Support / privacy contact:
https://github.com/hvozdieva-anastasiia/figma-plugin-private-notes/issues
