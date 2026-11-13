# Private Notes — пакет для публикации в Figma Community

Всё для формы публикации собрано здесь. Сгенерировано 2026-11-13.

## Состав

| Файл                    | Что это                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `listing-texts.md`      | Все тексты формы: имя, tagline, description, how-to-use, теги, обоснование `currentuser`, раскладка медиа по полям |
| `privacy-policy.md`     | Privacy Policy на английском (фактическое хранение, без обещания шифрования) — выложить на публичный URL           |
| `pre-publish-audit.md`  | Технический аудит: manifest, разрешения, сеть, модель приватности, честные риски, чек-лист причин отклонения       |
| `assets/icon-128.png`   | Иконка плагина, 128×128 (обязательное поле)                                                                        |
| `assets/icon-512.png`   | Иконка 512×512 — для профиля/прочих мест                                                                           |
| `assets/icon.svg`       | Исходник иконки (правится как SVG-код)                                                                             |
| `assets/cover.png`      | Обложка листинга, 1920×960                                                                                         |
| `assets/slide-1..5.png` | Карусель, 1920×1080: список, Smart Context, создание, массовые действия, устойчивость к конфликтам                 |
| `assets/ui-shots/*.png` | Чистые скриншоты реального UI без рамки окна (запасные, для доков/медиа)                                           |

## Как сгенерированы ассеты

Скриншоты — это настоящий собранный UI (`dist/index.html`), запущенный в
headless-Edge с заглушкой Plugin Main, отдающей фикстурные данные. Генераторы —
в `work/publish/` (gitignored): `make-harness.mjs` (stub+driver → страницы
состояний), `shoot.mjs` (скриншоты состояний), `make-pages.mjs` (обложка/слайды
→ HTML), `shoot-pages.mjs` (рендер 1920px), `render.mjs` (SVG→PNG для иконки).
Шрифт Inter 4.1 — `work/publish/fonts/` (OFPL, github.com/rsms/inter).

Перегенерация после изменения UI: `pnpm build`, затем
`node work/publish/make-harness.mjs && node work/publish/shoot.mjs &&
node work/publish/make-pages.mjs && node work/publish/shoot-pages.mjs`.

## Что делает пользователь руками

1. Community → Publish → Plugins → выбрать проект → заполнить форму текстами
   из `listing-texts.md`, загрузить ассеты.
2. Выложить `privacy-policy.md` на публичный URL, вставить ссылку.
3. Проверить, что имя «Private Notes» свободно (или взять запасное).
4. Убедиться, что `dist/` собран свежим (`pnpm build`) до импорта/публикации —
   публикуется именно `dist/code.js` + `dist/index.html` из манифеста.
