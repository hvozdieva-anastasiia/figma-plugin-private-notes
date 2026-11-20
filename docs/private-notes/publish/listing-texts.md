# Personal Notes & Tasks — поля публикации

Английские блоки готовы для вставки; русские пояснения остаются в проекте.
Сверено с реализацией и официальным потоком classic plugins 2026-11-20.
Отправки на ревью не было.

## Name

```text
Personal Notes & Tasks
```

Совпадает с manifest. ID `1702711724935928027` не менять.
Имя уже принято в проекте; перед отправкой повторно проверить Community.
Поиск не гарантирует юридическую или техническую доступность имени.

## Tagline

```text
Your notes and tasks, organized by file, page, and frame
```

Короткий вариант:

```text
Notes and tasks alongside your designs
```

## Short description

Если форма предлагает отдельное краткое описание:

```text
Keep personal notes and tasks in your Figma file. Find them by page or frame, track progress, and copy selected notes as Markdown.
```

## Description

```markdown
Keep design reminders and tasks close to the work they belong to.

Personal Notes & Tasks organizes your notes in one list inside Figma Design.
Attach each record to the whole file, a page, or a frame. In this plugin,
each Figma account sees its own records; no comments or canvas layers are created.

WHAT YOU CAN DO

• Write notes and tasks, edit their text, and mark tasks open or done.
• Browse a grouped, collapsible list with counts, text/target search, and
All / Notes / Open / Done filters.
• Switch to Current selection to see records for your working frame,
including nested frames. Selecting a layer uses its nearest frame.
• Jump from a note to its page or frame.
• Select records or groups to mark tasks done, reopen them, rebind targets,
delete with confirmation, or copy the selection as Markdown.
• Keep note text when a target is deleted and use Rebind to choose a new one.
• Refresh on return to the window. A detected stale edit offers conflict
choices before you save again.
• Resize the window and keep your preferred list scope between runs.

HOW TO START

1. Open an editable Figma Design file and run Personal Notes & Tasks.
2. Press +, choose Note or Task, and check the Target above the editor.
3. Write your text and press Save, or Ctrl+Enter / Cmd+Enter.
4. Use search, filters, and Current selection to find the records you need.

STORAGE AND PRIVACY

Records are stored in the Figma file's plugin data under their author's
Figma user ID. Figma synchronizes them with the file. This plugin makes no
network requests and has no external account, backend, analytics, or tracking.
Copy as Markdown exports selected text to your clipboard when you request it.

Notes are not encrypted. Showing only your account's records in this plugin
does not make the underlying file data confidential. Someone with sufficient
file or API access may be able to inspect it. Do not store passwords or secrets.

REQUIREMENTS AND LIMITS

• Figma Design with edit access. English interface.
• Up to 500 records per account per file and 4,000 characters per record.
• The target picker lists top-level frames on a chosen page. To target a nested
frame, select it on the canvas before opening a new note.
• Canvas selection does not change the target of an already-open editor.
• Figma Undo can revert multiple note changes from one plugin session.
• Revision checks detect stale edits after changes are visible locally;
simultaneous edits across clients are not guaranteed conflict-free.

Privacy policy:
https://github.com/hvozdieva-anastasiia/figma-plugin-private-notes/blob/main/docs/private-notes/publish/privacy-policy.md

Help and support:
https://github.com/hvozdieva-anastasiia/figma-plugin-private-notes/issues
```

Перед публикацией выложить исправленную policy: по публичному URL пока доступна
прежняя редакция от 2026-11-13. `Free` добавить после подтверждения цены в форме.

## How to use

Для отдельного поля документации или страницы справки:

```markdown
1. Run the plugin in an editable Figma Design file.
2. Press + and choose Note or Task. A single selected frame is the default
   target; otherwise the current page is used. Choose Whole file explicitly.
3. Use Target to change the binding, or choose another page or frame.
   The picker lists top-level frames on the requested page. For a nested
   frame, select that frame before creating a record.
4. Save with Save or Ctrl+Enter / Cmd+Enter. Changing the canvas selection
   while editing will not change the chosen target.
5. Search by text or target name. Filter All / Notes / Open / Done, and
   collapse groups to focus the list.
6. Use Current selection for the working frame and its nested-frame notes.
   Without a working frame, the current page provides the context.
7. Tick a task to mark it done; untick to reopen. Use the arrow action on a
   page/frame record to navigate to its target.
8. Press Select to choose records or groups. Use the bottom action bar for
   bulk changes, confirmed deletion, or Copy as Markdown.
9. Deleted targets keep their notes in No available target. Use Rebind to
   choose a replacement. Refresh if names or contents look out of date.
10. If an edit conflicts, review your draft and the stored version before
    continuing. Copy important draft text before closing Figma.
```

## Category and tags

Предлагаемая категория — `Design tools`; подобрать доступную подкатегорию для
productivity/organization. Не считать это фиксированным списком формы.

Предлагаемые теги: `notes`, `tasks`, `todo`, `design review`, `handoff`.
Figma допускает собственные теги; их не обязательно выбирать из подсказок.

## Images

| Поле      | Файл                                        | Размер        |
| --------- | ------------------------------------------- | ------------- |
| Icon      | `assets/icon-128.png`                       | 128×128 PNG   |
| Thumbnail | `assets/cover.png`                          | 1920×1080 PNG |
| Carousel  | `assets/slide-1.png` … `assets/slide-5.png` | 1920×1080 PNG |

Порядок: список → Smart Context → создание → массовые действия → конфликт.
Есть `icon-512.png`, SVG и чистые изображения `ui-shots/`. UI снят из собранного
приложения с демонстрационными данными. Холст и рамка окна — оформление;
это не снимки работающего Figma Desktop. Подробности в README пакета.

## Support contact

```text
https://github.com/hvozdieva-anastasiia/figma-plugin-private-notes/issues
```

## Privacy policy URL

```text
https://github.com/hvozdieva-anastasiia/figma-plugin-private-notes/blob/main/docs/private-notes/publish/privacy-policy.md
```

Публичный репозиторий и старая policy подтверждены через GitHub. Перед отправкой
проверить обе ссылки без авторизации и наличие обновлённого текста.

## Pricing and final details

В реализации нет платежей или платных функций. Предлагается `Free`;
окончательный выбор в форме остаётся за владельцем. Также выбрать автора
публикации, участников и разрешение комментариев. Playground не подготовлен,
он необязателен; изображения не являются playground-файлом.

## Permission justification

```text
The currentuser permission is used only to read figma.currentUser.id.
Plugin Main uses this ID to scope storage and every note operation to the
current author. The UI cannot supply an author ID. The plugin does not read
profile names, email addresses, or avatars, and makes no network requests.
Records are not encrypted; this is per-account filtering within the plugin.
```

## Initial release notes

```text
Initial release: notes and tasks grouped by file, page, and frame; search and
status filters; selection-aware context; target navigation and rebinding;
bulk actions; Markdown copying; resizable window; and stale-edit conflict
handling. Records are stored in the Figma file and are not encrypted.
```

## Message for the reviewer

Если есть поле пояснения или ревьюер запросит детали:

```text
This classic Figma Design plugin stores notes and tasks in document-root
plugin data. It creates no canvas layers or native comments. The currentuser
permission supplies only the author ID for per-account filtering, and
network access is set to none.

To test: run in an editable file, create a note and a task at file/page/frame
scope, search/filter them, navigate to a frame, change task status, use bulk
selection and Copy as Markdown, then delete a test frame and rebind its note.

Storage is not encrypted. The listing and privacy policy state this explicitly.
Revision checks handle stale local edits; they do not promise atomic
cross-client conflict resolution.
```

## Основание полей

Официальная [инструкция classic plugins](https://help.figma.com/hc/en-us/articles/360042293394-Publish-classic-plugins-to-the-Figma-Community)
перечисляет имя, tagline, описание, категорию, иконку, thumbnail, карусель,
необязательный security disclosure и поддержку. Рекомендуемые размеры:
128×128 и 1920×1080; до девяти дополнительных медиа. Нужны Desktop и 2FA.
Теги сверены с [рекомендациями Community](https://help.figma.com/hc/en-us/articles/22166943560983-Grow-your-audience-on-Community).
