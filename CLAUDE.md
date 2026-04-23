# Reels Factory — Claude Code Instructions

## Project Overview

Multi-agent system for creating Instagram Reels. User talks to Claude Code → Claude manages agents → generates content → web studio for recording.

## Structure

- **Agents:** `.claude/agents/*.md` — independent instruction files, NOT folders
- **Skills:** `.claude/skills/*/` — Python scripts for API calls, each with `SKILL.md` (YAML frontmatter required)
- **Hooks:** `.claude/hooks/bash/` — protection scripts (e.g., block .env commits)
- **Studio:** `studio/` — Node.js server + web frontend
- **Projects:** `projects/` — one folder per Reel (gitignored)

## Critical Rules

1. **Nanobanana = Google Gemini API** — NEVER use `api.nanobanana.com` (it doesn't exist). Use `google-genai` SDK with model `gemini-3-pro-image-preview`.
2. **API Keys:**
   - `GEMINI_API_KEY` — for photo (Gemini) AND video (Veo 3)
   - `PIAPI_KEY` — for video (Seedance 2 via PiAPI)
   - `ANTHROPIC_API_KEY` — for text, search, translation
3. **Never commit .env** — contains API keys
4. **Never modify `.claude/settings.json`** or `.claude/settings.local.json`
5. **Agents are .md files**, not folders. Python scripts go in `.claude/skills/`.

## Pipeline

**Pre-production** (до записи):
1. Config Agent (optional) → `config/profile.md`
2. Trend Agent → `projects/[name]/01_trend.md`
3. Script Agent → `projects/[name]/02_script.json`
4. Visual Agent → `projects/[name]/assets/backgrounds/` и `assets/slides/`

**Recording:**
5. Web Studio → `projects/[name]/output/recording_001.mp4`, `recording_002.mp4`, … (сегменты)

**Post-production** через `/finish` (~2 минуты, 4 шага):
6. **concat-segments skill** → `recording_full.mp4` (правильная склейка без рассинхрона A/V: stream-copy если параметры совпадают, иначе re-encode с CFR + async-resample аудио)
7. **Copywriter Agent** → `caption.txt`, `short_caption.txt`, `first_comment.txt`, `hashtags.txt`, `cover_text.json` — читает `02_script.json` напрямую
8. **Cover Agent** → интерактивно: 3 кадра из видео + 4-5 фото из `assets/photos/{work,portrait,lifestyle}` → пользователь выбирает → Gemini редактирует в единый бренд-фон → текст наложен локально (белый + оранжевый `#FF6B00`, Montserrat ExtraBold, без подчёркивания)
9. **Cleanup** → 5 финальных файлов в `output/`

**Опциональные субтитры** (`/finish --with-subs`, ~+5 минут):
- Transcribe (Whisper local) → `transcript.txt`
- Subtitle Agent → анализирует кадр, если чистая зона есть — вшивает; если нет — пропускает

**Что убрано из базового потока:**
- Transcribe/Subtitle — опционально через флаг (не для каждого рилза нужны субтитры)
- Analysis Agent — удалён, его данные уже есть в `02_script.json`

## Встроенный AI-терминал в Studio

В Electron-приложении Studio (`npm run electron` или ярлык «Reels Factory» на рабочем столе) есть плавающая кнопка **«💻 Терминал»** в правом нижнем углу. Горячая клавиша — `Ctrl+\``.

Клик открывает панель снизу с xterm.js и dropdown выбора AI-CLI:
- **Claude Code** (`claude`) — по умолчанию, использует подписку Anthropic
- **Codex** (`codex` — OpenAI CLI для ChatGPT Plus/Pro)
- **Aider** — универсальный ассистент
- **Shell** — обычный `cmd.exe`/`bash`

Конфиг команд: `electron/ai-backends.json`. Добавить свой CLI — допиши в `backends`.

Выбранный CLI запускается в cwd = корень проекта, автоматически видит `AGENTS.md`, `.claude/agents/*.md`, `.claude/skills/*/`. Смена backend: dropdown → автоматический рестарт сессии. Закрытие панели убивает процесс.

## Natural Flow Contract (КРИТИЧНО)

Агенты вызываются **автоматически цепочкой** без переспроса пользователя. Всего **3 точки паузы** на весь пайплайн:

| Этап | Автопоток | Пауза нужна? |
|---|---|---|
| Trend → выбор идеи | показывает 3-5 идей | **Да** — пользователь выбирает |
| Script | генерит сценарий → валидация → **сразу Visual Agent** | нет |
| Visual | рендерит фоны/слайды → **показывает инструкцию открыть Studio** | нет (пользователь идёт записывать) |
| Запись в Studio | — | (физическая пауза — человек снимает) |
| `/finish` запускает: | | |
| Transcribe | → сразу Subtitle | нет |
| Subtitle | решает вшивать/не вшивать → сразу Analysis | нет |
| Analysis | → сразу Copywriter | нет |
| Copywriter | → сразу Cover | нет |
| Cover → выбор фото | показывает 3 кадра + 4-5 фото из библиотеки | **Да** — пользователь выбирает |
| Cleanup | оставляет 5 файлов | нет |

**Правило для Claude-оркестратора**: после завершения одного агента **всегда** сразу вызывать следующего в цепочке. Не спрашивать «продолжить?». Единственные слова, на которые ждём ответа — выбор идеи (Trend) и выбор фото (Cover).

## Branding (обложки)

Единые ассеты в `.claude/agents/cover-system/`:
- `template-cover.png` — референс-фон (тёмная workspace, оранжевые искры снизу)
- `system-prompt.txt`, `task-prompt-template.txt`, `style-rules.txt` — правила Gemini
- Фото автора: `assets/photos/{work,portrait,lifestyle}/`
- Модель Gemini: `gemini-3-pro-image-preview` (primary) → `gemini-2.5-flash-image` (fallback)
- Цвета текста: **LINE1 `#FFFFFF` (белый)**, **LINE2 `#FF6B00` (оранжевый)** — и никакие другие

## Validation

After every script generation/edit: `python3 .claude/skills/validate-script/validate.py projects/[name]/02_script.json`

## Background Prompt Rules

Every background prompt MUST include:
```
background plate for talking head video, soft even lighting,
no harsh shadows, no foreground objects, color palette compatible
with indoor skin tones, 9:16 vertical portrait orientation
```

## Instagram Safe Zones (CRITICAL)

All visual content MUST respect Instagram Reels safe zones:
- **Right 15%** (162px of 1080) — engagement buttons (like, comment, share)
- **Bottom 30%** (570px of 1920) — description zone + camera overlay area
- **Top 8%** (150px of 1920) — app menu bar

**For AI photo/video backgrounds:** important visual elements (text, objects of interest) must be placed in the upper 70% and left 85% of the frame. The bottom 30% will be covered by the camera overlay.

**For HTML slides:** templates have built-in safe zone padding (150px top, 160px right, 570px bottom, 60px left).
