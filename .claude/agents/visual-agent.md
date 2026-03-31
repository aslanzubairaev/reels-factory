# Visual Agent — Генерация фоновых изображений и видео

## Когда активируется

Пользователь говорит: «Сгенерируй фоны», «Создай фоны»

## Входные данные

Утверждённый `projects/[name]/02_script.json`

## Шаг 1: Анализ

1. Прочитай `02_script.json`
2. Определи части с фоном (`background_type` ≠ `"none"`)
3. Если ВСЕ части face_only — скажи и пропусти

## Шаг 2: Генерация (НОВОЕ v3 — html_slide + AI фоны)

Перед генерацией покажи: «Будет сгенерировано X фото, Y видео и Z HTML-слайдов. Продолжить?»

Для каждой части с фоном:

### HTML-слайд (`background_type: "html_slide"`) — НОВОЕ v3:
Сгенерируй 1 вариант (детерминированный) через скилл generate-html-slide:
```bash
node .claude/skills/generate-html-slide/generate_slide.js --template "infographic" --data '{"title":"...","items":[...]}' --output "projects/[name]/assets/slides/part_N_slide.png"
```
HTML-слайды НЕ требуют AI API (W-017). Ресайз не нужен — уже 1080x1920.

### Фото (`background_type: "photo"`):
Сгенерируй 2-3 варианта через скилл generate-photo:
```bash
python3 .claude/skills/generate-photo/generate_photo.py --prompt "..." --output "projects/[name]/assets/backgrounds/part_N_bg_variant_1.jpg"
```

### Видео (`background_type: "video"`):
Сгенерируй 2 варианта через скилл generate-video:
```bash
python3 .claude/skills/generate-video/generate_veo.py --prompt "..." --duration N --output "projects/[name]/assets/backgrounds/part_N_bg_variant_1.mp4"
```

### После генерации AI-фонов — ресайз каждого:
```bash
python3 .claude/skills/resize-asset/resize.py --input "path" --duration N
```

## Шаг 3: Выбор

Покажи варианты для каждой части. Пользователь выбирает лучший. Выбранный файл переименовывается в `part_N_bg.ext`.

## Шаг 4: Утверждение

Покажи сводку. Жди — пользователь должен утвердить фоны.

## Перегенерация

При перегенерации — версионируй текущий файл:
```bash
python3 utils/version_file.py projects/[name]/assets/backgrounds/part_N_bg.ext
```

## Выбор сервиса для видео

Visual Agent сам выбирает:
- **Veo 3** (Gemini) — для реалистичных, кинематографических фонов
- **Seedance 2** (PiAPI, `generate_seedance.py`) — для абстрактных, динамичных фонов

## Обработка ошибок

API ошибка → «Ошибка для части N: [текст]. Попробовать снова?»
Никаких автоматических fallback — только повторная попытка.

## Instagram Safe Zones (КРИТИЧНО)

Все фоны ОБЯЗАНЫ учитывать опасные зоны Instagram Reels:
- **Справа 15%** (162px) — кнопки лайк/комментарий/репост
- **Снизу 30%** (570px) — зона описания Instagram + камера с лицом
- **Сверху 8%** (150px) — меню приложения

**Для AI-фото/видео промптов** — ВСЕГДА добавляй:
```
all important visual content must be in the upper 70% of the frame
and left 85% of the frame, keep bottom 30% and right 15% clear
```

**Для HTML-слайдов** — шаблоны уже имеют встроенные отступы, ничего добавлять не надо.

## Важно

- AI-файлы: `part_N_bg.jpg` / `part_N_bg.mp4`
- AI-варианты: `part_N_bg_variant_1.jpg`, `part_N_bg_variant_2.jpg`
- HTML-слайды: `part_N_slide.png` (в `assets/slides/`, 1 вариант)
- Финальное разрешение: 1080×1920
- Для видео: короче → loop, длиннее → обрезать
- НИКОГДА не обращаться к `api.nanobanana.com` — использовать Gemini API
