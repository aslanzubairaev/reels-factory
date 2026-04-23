# Visual Agent — Подготовка фонов для записи

## Когда активируется
Пользователь говорит: «Сгенерируй фоны», «Создай фоны», либо автоматически после Script Agent.

## Входные данные
Утверждённый `projects/[name]/02_script.json`

## Шаг 1: Проанализировать этапы

Прочитай `02_script.json`. Для каждого этапа уже установлен `background_type` Script Agent'ом по иерархии надёжности:

**Порядок приоритета (от самого надёжного к менее надёжному):**

| `background_type` | Когда используется | Риски |
|---|---|---|
| `face_only` | Эмоциональные/личные этапы (hook, CTA) | 0 — фона нет, всегда работает |
| `screen_capture` | Демо экрана, код, приложение | 0 — пользователь сам выберет окно в Studio |
| `html_slide` | Факты/числа/сравнения/списки | минимальные — локальный рендер Puppeteer |
| `photo` (AI через Gemini) | Только если нужен «художественный» фон | зависит от API + качества промпта |
| `video` (Veo/Seedance) | Редко, дорого | самый высокий риск — медленно, дорого |

Если Script Agent поставил тип выше приоритета (например, `photo` для факта-этапа) — **можешь мягко предложить переключить на `html_slide`**.

## Шаг 2: Генерация

Покажи сводку: «Этапы: 6 (2 face_only, 2 html_slide, 1 screen_capture, 1 photo). Генерировать 1 AI-фото + 2 HTML-слайда? Продолжить?»

Для каждого этапа с фоном:

### `face_only` и `screen_capture`
**Ничего не генерируем.** `face_only` — просто запись на фоне темы студии. `screen_capture` — пользователь выберет окно в Studio вручную перед записью.

### `html_slide`
```bash
node .claude/skills/generate-html-slide/generate_slide.js --template "infographic" --data '{"title":"...","items":[...]}' --output "projects/[name]/assets/slides/part_N_slide.png"
```
HTML-слайды **не требуют API**, рендерятся Puppeteer'ом локально. Размер сразу 1080×1920 — ресайз не нужен.

### `photo` (AI Gemini)
```bash
python .claude/skills/generate-photo/generate_photo.py --prompt "..." --output "projects/[name]/assets/backgrounds/part_N_bg.jpg"
```

**При ошибке Gemini:**
1. Первый раз — повторить с тем же промптом
2. Второй раз — **автоматически переключить этап на `face_only`**: обновить `02_script.json` (`background_type="face_only"`, `layout="face_only"`), сообщить пользователю «Gemini недоступен на этапе N — поставил face_only, пайплайн продолжается» и идти дальше.

НЕ блокировать пайплайн на одной неудачной генерации.

### `video` (Veo/Seedance)
Используется редко. При ошибке — так же fallback на `face_only` со второй попытки.

### После любой AI-генерации — ресайз:
```bash
python .claude/skills/resize-asset/resize.py --input "path" --duration N
```

## Шаг 3: Instagram Safe Zones (КРИТИЧНО)

**Для AI-промптов** (photo/video) — ВСЕГДА добавляй в конец:
```
all important visual content must be in the upper 70% of the frame
and left 85% of the frame, keep bottom 30% and right 15% clear
9:16 vertical portrait orientation, soft even lighting
```

**Для HTML-слайдов** — шаблоны уже имеют встроенные safe-зоны, ничего добавлять не надо.

## Шаг 4: Итог
Короткая сводка: сколько фонов/слайдов сгенерировано, какие этапы без фона. Не вызывай следующего агента — пользователь должен открыть Studio и записать видео.

```
Фоны готовы. Открой Studio → выбери проект <name> → запиши видео.
Когда закончишь — /finish в терминале.
```

## Правила
- Файлы: `part_N_bg.jpg` (AI) / `part_N_slide.png` (HTML) / `part_N_bg.mp4` (AI-video)
- НИКОГДА не обращаться к `api.nanobanana.com` — использовать Gemini через `google-genai`
- Финальное разрешение всех ассетов: 1080×1920
- Если этап уже имеет `custom_file` (пользователь загрузил своё) — не трогать его
