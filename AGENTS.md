# Reels Factory — AI Agents Index

Этот файл — индекс AI-агентов проекта для любого CLI-инструмента (Claude Code, Codex, Aider и т.д.). Если ты запускаешь `claude`, `codex` или похожий инструмент из корня проекта — начинай отсюда.

## Структура

Полные инструкции агентов лежат в `.claude/agents/*.md`. Оригинально они написаны для Claude Code, но это обычный Markdown — любой AI-CLI может их читать и выполнять.

| Агент | Файл | Роль |
|---|---|---|
| **Trend** | `.claude/agents/trend-agent.md` | Предлагает идеи для Reels (запускается на фразы «хочу идею для рилза», «новый рилз») |
| **Script** | `.claude/agents/script-agent.md` | Пишет сценарий по выбранной идее → `projects/[name]/02_script.json` |
| **Visual** | `.claude/agents/visual-agent.md` | Генерирует фоны/слайды (Gemini AI photo/video, HTML templates) |
| **Transcribe** | `.claude/agents/transcribe-agent.md` | Whisper → транскрипт после записи |
| **Subtitle** | `.claude/agents/subtitle-agent.md` | Анализ безопасной зоны → karaoke-субтитры (ASS) + вшивание |
| **Analysis** | `.claude/agents/analysis-agent.md` | Разбор темы, ЦА, вирусности → `analysis.json` |
| **Copywriter** | `.claude/agents/copywriter-agent.md` | caption, first_comment, hashtags, cover_text |
| **Cover** | `.claude/agents/cover-agent.md` | Выбор фото → Gemini бренд-фон → наложение текста Pillow'ом |

## Workflow

**Pre-recording:** Trend → Script → Visual → *Studio: запись*
**Post-recording:** `/finish` → Transcribe → Subtitle → Analysis → Copywriter → Cover → Cleanup

Подробно: `CLAUDE.md` раздел «Pipeline» + `SPEC_MERGE.md`.

## Ключевые файлы

| Что | Где |
|---|---|
| Инструкции для Claude Code | `CLAUDE.md` |
| Подробная спецификация | `SPEC_MERGE.md` |
| Правила обложки (brand) | `.claude/agents/cover-system/style-rules.txt`, `system-prompt.txt` |
| Библиотека фото автора | `assets/photos/{work,portrait,lifestyle}/` |
| Python-скиллы | `.claude/skills/*/` |
| Оркестратор пост-продакшна | `.claude/commands/finish.md` |
| Схема сценария | `schemas/script.schema.json` |

## Ключевые правила

1. **Бренд обложки:** текст белый `#FFFFFF` + оранжевый `#FF6B00`, шрифт Montserrat ExtraBold. Никаких других цветов.
2. **Субтитры:** либо вшиваем в чистую зону (top/center/low по `subtitle_placement.json`), либо **пропускаем** — не портить видео.
3. **Safe zones Instagram:** top 150px, right 162px (Y 750-1500), bottom 380px.
4. **Финал:** после `/finish` в `projects/<name>/output/` остаются ровно 5 файлов (`final_video_subs.mp4`, `cover_final.png`, `caption.txt`, `first_comment.txt`, `hashtags.txt`).

## Запуск

Из корня `C:\dev\Reels-Factory` (или путь твоего клона):
- `claude` — Claude Code
- `codex` — Codex CLI от OpenAI
- `aider` — универсальный AI-ассистент

Все три будут работать одинаково хорошо с этим набором агентов.

## Environment

- `.env` должен содержать: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `PIAPI_KEY`, `OPENAI_API_KEY` (последние три — для генерации фонов; если CLI запускается с подпиской, его API-ключ не нужен отдельно)
- Python ≥ 3.12, Node.js ≥ 18, FFmpeg в PATH, Pillow/google-genai/openai-whisper в pip
