# Private Notes — тексты для формы публикации Figma Community

Все поля ниже готовы к копированию. Английский текст — то, что вставляется в
форму; русские пометки — пояснения, в форму не вставляются.

Форма открывается в Figma Desktop: Community → Publish → Plugins → выбрать
проект плагина. Поля формы у Figma периодически меняются; ниже покрыт полный
набор, который встречается в актуальном потоке публикации.

---

## 1. Plugin name

```
Private Notes
```

Совпадает с `manifest.json` → `"name": "Private Notes"`.

⚠️ **Занято.** В Community уже есть опубликованный плагин «Private Notes»
(`figma.com/community/plugin/1482292605630548301`, март 2025, автор Shriya) —
та же ниша: приватные аннотации, видимые только автору. Есть и «Private
Comments – Personal Notes in Figma». Дубликаты имён формально допустимы, но
одноимённый плагин в той же категории — прямой риск отказа как
confusingly-similar/duplicate и гарантированно плохая находимость в поиске.

Лочится только `id` в manifest (к нему привязаны сохранённые заметки) — поле
`name` можно менять безболезненно. Кандидаты, сохраняющие смысл, но свободные
(проверить финальный выбор поиском в Community):

```
Solo Notes
Quiet Notes — private annotations
Off Canvas — private notes
```

Если решено оставить «Private Notes» — запасной вариант листинга:
`Private Notes — file-local` (имя листинга может отличаться от имени плагина
в манифесте, но чем дальше от занятого, тем лучше).

## 2. Tagline

```
Personal notes and tasks inside the file — for your eyes only
```

Запасной вариант (если лимит короче):

```
Notes & tasks inside the file — for your eyes only
```

## 3. Description (основное описание)

```markdown
Private Notes is a personal scratchpad and task list that lives inside the
Figma file you are working in. Every note is anchored to a target you choose —
the whole file, a page, or a specific frame — so feedback, TODOs and design
reminders sit right next to the work they belong to.

Your notes are yours alone: they are stored per Figma account, and teammates
who open the same file see only their own notes. Nothing is created in the
document — no layers, no comments, no mentions — so collaborators never notice
a thing.

WHAT YOU CAN DO

• Attach a note to the whole file, a page, or any frame. Jump back to the
target with one click.
• Turn a note into a task with an open/done checkbox. Done tasks stay in the
list instead of disappearing.
• One grouped, collapsible list with counters, full-text search (text and
target names) and filters: All / Notes / Open / Done.
• "Current selection" scope follows your work: select a frame on the canvas
and instantly see only its notes — including notes on frames nested inside.
• Bulk select: mark tasks done, reopen, move notes to another target, delete —
or copy the selection as Markdown to hand off to docs or chat.
• Resilient to edits: renamed or moved targets are followed automatically;
deleted targets move notes to "No available target" with the text intact and
a Rebind action. Save conflicts (two windows, Undo/Redo) show both versions
and let you choose instead of overwriting silently.
• Small comforts: resizable window that remembers its size, list refresh on
window focus, Ctrl+Enter to save.

PRIVACY, IN PLAIN TERMS

• Notes are stored in the file's own plugin data under your Figma user ID, so
they sync with the file like any other plugin data. The plugin window only
ever shows your own records.
• Notes are NOT encrypted. Figma plugin data is a storage mechanism, not a
secrets vault: other plugins or API access to the file could technically
read it. Do not store passwords, keys, or secrets in notes.
• Zero network access (declared in the manifest). No analytics, no tracking,
no external accounts, nothing leaves the file.
• Writing notes requires edit access to the file. View-only mode cannot save
notes.

LIMITS

• Up to 500 notes per user per file, up to 4,000 characters per note.
• Figma's Undo treats one plugin run as one step: a single Ctrl+Z can revert
all notes written in that session. The window always shows the real document
state on refresh.

Free. English UI.
```

## 4. How to use (инструкция — для description или отдельного блока)

```markdown
1. Open the file you want to annotate, then run Plugins → Private Notes.
2. Press + to create a note. Choose Note or Task, pick a Target
   (the selected frame, the current page, the whole file, or "Choose another
   page or frame…" to search), write the text, Save (or Ctrl+Enter).
3. Browse: the list groups notes under Whole file → Page → Frame. Collapse
   groups, use search and the All / Notes / Open / Done filters.
4. Jump to work: the → button on a page or frame note switches to that page
   and scrolls the frame into view.
5. Work in context: select a frame on the canvas and switch to
   "Current selection" to see only its notes. The "Now:" line shows where you
   are and how many notes are there.
6. Tasks: tick a task's checkbox to mark it done; click again to reopen.
7. Bulk actions: press Select, tick notes or whole groups, then mark done /
   reopen / move / delete — or Copy as Markdown to paste the notes into docs,
   tickets, or chat.
8. Housekeeping: deleted targets move notes to "No available target" — open
   one and press Rebind to attach it elsewhere. The window resizes from the
   bottom-right corner and remembers its size.
```

## 5. Tags / категории

Форма Figma даёт выбрать теги из фиксированного списка. Искать и выбирать:

- `productivity` / `utilities` — основная категория
- `notes` / `tasks` / `todo` — если есть в списке
- `collaboration` — вторично (заметки личные, но про совместную работу над файлом)

Не выбирать: design, prototyping, AI, developer tools — нерелевантные теги
увеличивают риск отклонения как «misleading categorization».

## 6. Media (иконка, обложка, карусель)

Файлы лежат в `docs/private-notes/publish/assets/`:

| Поле формы                        | Файл                                 | Размер        |
| --------------------------------- | ------------------------------------ | ------------- |
| Plugin icon                       | `assets/icon-128.png`                | 128×128 PNG   |
| Cover image                       | `assets/cover.png`                   | 1920×960 PNG  |
| Media / screenshots (до 9–10 шт.) | `assets/slide-1.png` … `slide-5.png` | 1920×1080 PNG |

Порядок карусели: slide-1 (список) → slide-2 (Smart Context) → slide-3
(создание) → slide-4 (массовые действия) → slide-5 (конфликт/устойчивость).

Иконка в большом размере для профиля/других мест: `assets/icon-512.png`.
Исходник иконки: `assets/icon.svg` (редактируется как код).
Дополнительные чистые скриншоты UI (без рамки окна) — `assets/ui-shots/*.png`.

## 7. Privacy policy URL

```
https://github.com/hvozdieva-anastasiia/figma-plugin-private-notes/blob/main/docs/private-notes/publish/privacy-policy.md
```

Репозиторий публичный — URL работает сразу после push. Альтернатива
покрасивее: GitHub Pages на тот же файл (включается в Settings → Pages),
но blob-URL достаточен и уже живой.

## 8. Support / contact

```
Support: https://github.com/hvozdieva-anastasiia/figma-plugin-private-notes/issues
```

Строку можно добавить в конец description или в поле поддержки формы —
issue-трекер репозитория, email не требуется.

## 9. Pricing

```
Free
```

(Платный плагин нельзя потом сделать бесплатным; бесплатный → платный через
обновление тоже ограничен — решение за вами, но продукт позиционировался как
бесплатный.)

## 10. Permissions justification (если форма спросит, зачем `currentuser`)

```
The plugin needs figma.currentUser.id to scope each note to its author: notes
are stored in the file's plugin data keyed by the author's Figma user ID, so
every collaborator sees only their own notes. No other user data is read.
```
