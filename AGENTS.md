# Reels Factory — AI Agents Index

Индекс AI-агентов для любого CLI-инструмента (Claude Code, Codex и т.д.). Если запускаешь `claude` или `codex` из корня проекта — начинай отсюда.

## Структура

Инструкции агентов — `.claude/agents/*.md`. Это обычный Markdown — любой AI-CLI может читать и выполнять.

| Агент | Файл | Роль |
|---|---|---|
| **Trend** | `.claude/agents/trend-agent.md` | Предлагает идеи для Reels |
| **Script** | `.claude/agents/script-agent.md` | Пишет сценарий → `projects/[name]/02_script.json` |
| **Visual** | `.claude/agents/visual-agent.md` | Фоны/слайды: face_only / screen_capture / html_slide / AI photo |
| **Copywriter** | `.claude/agents/copywriter-agent.md` | caption, first_comment, hashtags, cover_text — из `02_script.json` |
| **Cover** | `.claude/agents/cover-agent.md` | Выбор фото → Gemini бренд-фон → текст Pillow'ом |
| **Transcribe** *(опц.)* | `.claude/agents/transcribe-agent.md` | Whisper → транскрипт (при `/finish --with-subs`) |
| **Subtitle** *(опц.)* | `.claude/agents/subtitle-agent.md` | Анализ зоны → karaoke-субтитры + вшивание (при `/finish --with-subs`) |

## Workflow

**Pre-recording:** Trend → Script → Visual → *Studio: запись*
**Post-recording:** `/finish` → concat-segments → Copywriter → Cover → Cleanup (~2 мин)
**С субтитрами:** `/finish --with-subs` → добавляет Transcribe + Subtitle (~+5 мин)

Подробности — `CLAUDE.md` (раздел «Pipeline») и `.claude/commands/finish.md`.

## Ключевые файлы

| Что | Где |
|---|---|
| Инструкции | `CLAUDE.md` |
| Правила обложки (brand) | `.claude/agents/cover-system/style-rules.txt` |
| Фото автора | `assets/photos/{work,portrait,lifestyle}/` |
| Python-скиллы | `.claude/skills/*/` |
| Оркестратор пост-продакшна | `.claude/commands/finish.md` |
| Схема сценария | `schemas/script.schema.json` |

## Ключевые правила

1. **Бренд обложки:** белый `#FFFFFF` + оранжевый `#FF6B00`, Montserrat ExtraBold. Без подчёркивания.
2. **Субтитры:** опциональны (`--with-subs`). Если зона в кадре грязная — пропускать.
3. **Safe zones Instagram:** top 150px, right 162px (Y 750-1500), bottom 380px.
4. **Финал:** в `projects/<name>/output/` ровно 5 файлов (`final_video_subs.mp4`, `cover_final.png`, `caption.txt`, `first_comment.txt`, `hashtags.txt`).
5. **Приоритет типов фона:** `face_only` → `screen_capture` → `html_slide` → AI photo (редко) → AI video (почти никогда).

## Запуск CLI

Из корня проекта:
- `claude` — Claude Code (подписка Anthropic)
- `codex` — OpenAI CLI (подписка ChatGPT Plus/Pro)

## Environment

В `.env` (см. `.env.example`):
- `ANTHROPIC_API_KEY` — для перевода промптов и ai-slide-data (опц.)
- `GEMINI_API_KEY` — для фонов/обложек (нужен всегда)
- `PIAPI_KEY` — для Seedance (опц.)
- `OPENAI_API_KEY` — DALL-E fallback (опц.)

Python ≥ 3.9, Node.js ≥ 18, FFmpeg в PATH.
