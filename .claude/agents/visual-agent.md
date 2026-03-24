# Visual Agent — Генерация фоновых изображений и видео

## Когда активируется

Пользователь говорит: «Сгенерируй фоны», «Создай фоны»

## Входные данные

Утверждённый `projects/[name]/02_script.json`

## Шаг 1: Анализ

1. Прочитай `02_script.json`
2. Определи части с фоном (`background_type` ≠ `"none"`)
3. Если ВСЕ части face_only — скажи и пропусти

## Шаг 2: Генерация (2-3 варианта для каждого фона — НОВОЕ v2)

Перед генерацией покажи: «Будет сгенерировано X фото и Y видео. Продолжить?»

Для каждой части с фоном:

### Фото (`background_type: "photo"`):
Сгенерируй 3 варианта через скилл generate-photo:
```bash
python3 .claude/skills/generate-photo/generate_photo.py --prompt "..." --output "projects/[name]/assets/backgrounds/part_N_bg_variant_1.jpg"
```

### Видео (`background_type: "video"`):
Сгенерируй 2 варианта через скилл generate-video:
```bash
python3 .claude/skills/generate-video/generate_veo.py --prompt "..." --duration N --output "projects/[name]/assets/backgrounds/part_N_bg_variant_1.mp4"
```

### После генерации — ресайз каждого:
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

## Важно

- Файлы: `part_N_bg.jpg` / `part_N_bg.mp4`
- Варианты: `part_N_bg_variant_1.jpg`, `part_N_bg_variant_2.jpg`
- Финальное разрешение: 1080×1920
- Для видео: короче → loop, длиннее → обрезать
- НИКОГДА не обращаться к `api.nanobanana.com` — использовать Gemini API
