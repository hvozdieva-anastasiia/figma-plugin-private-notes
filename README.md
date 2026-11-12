# Private Notes — окружение разработки

Плагин Figma для личных заметок и задач, привязанных ко всему файлу, странице или фрейму. Записи хранятся в pluginData открытого документа, автор проверяется в Plugin Main. Подробности: [архитектура](docs/private-notes-architecture.md) и [план реализации](docs/private-notes-implementation-plan.md), версия 4.

**Статус: этап 1 из 8 — окружение и идентичность проекта.** Заметки, основной UI, база и шифрование не реализованы. Точки входа (`src/plugin/index.ts`, `src/ui/main.tsx`) пустые и нужны только для проверки сборки. Шифрование не согласовано и не реализовано; хранение в pluginData не скрывает записи от технических средств доступа к документу.

## Требования

Node.js 24 и pnpm 11.25.0 (закреплён в `packageManager`). Версии библиотек закреплены в `package.json` и `pnpm-lock.yaml`; не обновлять их в рамках установки.

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm dev:ui
```

Если pnpm не установлен глобально, `tooling/pnpm.ps1` запускает pnpm из каталога установленного Node. Скрипт требует `node` в PATH и разрешения на запуск `.ps1` в системе.

Адрес локального просмотра покажет Vite; сейчас страница пустая. `pnpm dev` пересобирает UI и plugin при изменениях, `pnpm build` создаёт `dist/index.html` со встроенными ресурсами и `dist/code.js` для Figma sandbox.

## Подключение к Figma

Манифест: Figma Design, `documentAccess: dynamic-page`, разрешение `currentuser`, сеть запрещена. Private API, OAuth и backend не используются.

Постоянный plugin ID выдан Figma и записан в `manifest.json`. Менять его нельзя: он связывает плагин с сохранёнными данными. Для импорта: Plugins → Development → Import plugin from manifest, выбрать корневой `manifest.json`.

Если ID когда-нибудь придётся задать заново (новый клон без поля `id`): создать плагин через Plugins → Development → New plugin, взять `id` из его `manifest.json` и выполнить `pnpm plugin:id ЧИСЛОВОЙ_ID`.

Пустые точки входа пока не открывают окно плагина.

## Проверки

- `pnpm typecheck` — TypeScript 7 (`@typescript/native`) отдельно для UI, Figma sandbox и конфигурации.
- `pnpm lint` — ESLint и React Hooks.
- `pnpm format:check` / `pnpm format` — Prettier.
- `pnpm test` / `pnpm test:watch` — Vitest + jsdom. Пустой набор допускается; 15 существующих тестов относятся к изолированному эксперименту со ссылками на комментарии и не проверяют Private Notes.
- `pnpm check` — все проверки и сборка.

Пакет `typescript` в зависимостях — alias `@typescript/typescript6@6.0.2`, нужный только JavaScript API линтера. Компилятор `tsc` — TypeScript 7.0.2 из `@typescript/native`. Не заменять одно другим.

## Старые материалы

`docs/architecture.md`, `docs/implementation-plan.md`, `docs/product-decisions.md`, `docs/ui-scenarios.md`, `docs/testing-plan.md`, `docs/experiments/` и `experiments/native-comment-navigation/` относятся к прежнему проекту Common Structurizer. Они сохранены как архив и не являются решениями Private Notes.

## Skills

Установлены в `.agents/skills`, относятся только к этому проекту. Источники и ревизии: `docs/skills-sources.json`. Upstream skills при форматировании не менять.

1. Vercel React Best Practices — качество React и производительность.
2. Vercel Composition Patterns — архитектура компонентов.
3. Vercel Web Design Guidelines — доступность и UX-аудит.
4. Impeccable — проектирование интерфейса, critique, audit, polish.
5. TypeScript Advanced Types — типизация моделей данных и сообщений между UI и Figma sandbox.
