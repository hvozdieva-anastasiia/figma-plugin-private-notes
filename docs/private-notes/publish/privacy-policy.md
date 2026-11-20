# Privacy Policy — Personal Notes & Tasks

Last updated: 2026-11-20

Personal Notes & Tasks is a Figma Design plugin maintained in the
[hvozdieva-anastasiia/figma-plugin-private-notes repository](https://github.com/hvozdieva-anastasiia/figma-plugin-private-notes).
It associates notes and tasks with a file, page, or frame. The plugin filters
records by their author's Figma account. It does not encrypt them or provide
a confidential storage service.

## Data used and stored

The plugin reads your Figma user ID from `figma.currentUser.id` to identify
your records. It does not read your account email, name, or profile photo.

Each record contains the note ID, author ID, note/task type, text, task status,
target type, page/frame IDs and name snapshots, creation/update timestamps,
schema version, and revision number. It is stored as JSON in the Figma file's
document-root plugin data, one key per record. Your ID is in the key and value.

The plugin reads page names and IDs, the current selection and ancestor frames,
and target names and IDs to group notes and navigate. The target picker lists
pages and top-level frames on a requested page; known targets are resolved by
ID. The plugin does not export artwork or read design text-layer contents.

Window dimensions and the All notes / Current selection preference are stored
in Figma's `clientStorage`; note text is not. Unsaved drafts are held in the
plugin window's memory and are not a persistent backup.

## Network access and Figma hosting

The plugin declares no network access (`allowedDomains: ["none"]`) and makes
no application-level network requests. It has no developer-operated backend,
analytics, advertising, telemetry, or automatic crash reporting. The plugin
does not send note contents to its maintainer.

Figma stores and synchronizes the file and its plugin data through Figma's own
services. No-network permission for this plugin does not disable Figma sync,
file history, backups, or processing. Figma's handling of data is governed by
[Figma's Privacy Policy](https://www.figma.com/legal/privacy/).

## Visibility and security limits

In normal use of this plugin, each Figma account sees and manages its own
records. Author checks run in Plugin Main; the window cannot choose an author
ID. This is application-level filtering, not encryption or a separate file
access-control boundary.

Figma namespaces plugin data by plugin ID: other plugin IDs cannot read it
through `getPluginData`. However, Figma explicitly warns that this storage is
not a security mechanism. A person with sufficient file access may inspect
data, for example through a file export or authorized API access. Notes may
also accompany file copies. Do not store passwords, credentials, or other
sensitive secrets. See Figma's
[plugin-data documentation](https://developers.figma.com/docs/plugins/api/properties/nodes-setplugindata/)
and [REST file API](https://developers.figma.com/docs/rest-api/file-endpoints/).

## Copying and support

Copy as Markdown writes selected records to your system clipboard only after
you choose that action. If access fails, the plugin displays text for manual
copying. Clipboard history, clipboard synchronization, and apps you paste into
have their own data handling. The plugin does not automatically upload it.

Information you choose to send to support is processed by the support platform.
GitHub issues are public: do not include note contents, credentials, private
file links, or personal information in a report.

## Retention and deletion

Notes remain in the file until you delete them or the file is removed under
Figma's lifecycle. Closing or uninstalling the plugin does not erase notes.
No automatic expiration is implemented.

Deleting a note removes its key from the current document state. Figma Undo,
version history, backups, exports, and existing file copies may retain or
restore previous data; this is not guaranteed permanent erasure. File deletion
and recovery follow Figma's retention rules. The maintainer has no separate
note database to erase or recover.

Window/view preferences are managed through Figma client storage. The plugin
has no in-app reset and does not promise that reinstalling clears that storage.

## Changes and contact

This policy will be updated when data handling changes, alongside the release.
For support or a privacy inquiry, use the
[project issue tracker](https://github.com/hvozdieva-anastasiia/figma-plugin-private-notes/issues).
For a sensitive inquiry, first request a private contact method without
posting the sensitive information itself.
