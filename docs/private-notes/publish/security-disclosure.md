# Personal Notes & Tasks — ответы по безопасности

Заготовки на английском для optional Data security/security disclosure.
Формулировки вопросов в форме могут меняться. Ответ относится к обработке
данных плагином, а не к инфраструктуре Figma или GitHub. Не отвечать «нет
пользовательских данных»: есть текст записей и Figma user ID.

| Тема                  | Ответ для адаптации к точному вопросу                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User data             | The plugin processes note/task text, Figma user IDs, target IDs/names, timestamps, and record revisions.                                                                                |
| Storage               | Records are stored unencrypted in document-root Figma plugin data. Window size and list scope use Figma clientStorage. There is no developer-operated database.                         |
| Identity              | Only figma.currentUser.id is read. No account email, profile name, or avatar is read.                                                                                                   |
| External transmission | The plugin has no network access and makes no application-level requests. Figma independently stores and synchronizes the containing file and plugin data.                              |
| Encryption            | The plugin does not implement encryption at rest or end-to-end encryption. It does not make claims about Figma's infrastructure encryption.                                             |
| Access                | Plugin Main filters operations by the current author ID. This is not a confidentiality boundary against sufficient file/export/API access.                                              |
| Third parties         | No developer-selected analytics, hosting, advertising, or AI processors are used by the plugin. Figma hosts the file; GitHub processes information users voluntarily submit to support. |
| Retention             | No automatic expiration. Records remain in the file until deleted. Uninstalling does not erase them.                                                                                    |
| Deletion              | Deletion removes the current plugin-data key. Undo, history, backups, exports, and copies may retain or restore data. The maintainer cannot erase Figma backups.                        |
| Export                | Copy as Markdown writes the user's selected records to the clipboard on request, with manual-copy fallback.                                                                             |
| Telemetry             | No analytics, tracking, note-content logging, or automatic crash reporting.                                                                                                             |
| Certifications        | No independent security certification or penetration-test report is claimed for this plugin.                                                                                            |

Если вопрос объединяет обработку/хранение/передачу в одно «collect data»,
указать перечисленные данные и пояснить local/file storage; не прятать их за
фразой «мы не собираем данные». На вопросы о SOC 2, GDPR certification, SSO,
сроках реагирования или инфраструктуре Figma не придумывать соответствие.
