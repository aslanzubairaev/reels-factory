---
name: subtitle
description: Создание субтитров (ASS/SRT) и вшивание в видео с цветокоррекцией. Включает анализ кадра для безопасного размещения.
arguments:
  - name: output_dir
    description: Путь к папке output проекта
    required: true
---

# Скилл: Субтитры

## Скрипты
- `analyze_frame.py <video_path>` — анализ кадра, поиск свободной зоны
- `generate_subs.py <output_dir>` — генерация ASS + SRT из words_raw.json
- `render_video.py <video_path> <ass_path> [--no-subs]` — вшивание субтитров + цветокоррекция

## Зависимости
- FFmpeg в PATH
- `opencv-python` (`pip install opencv-python`)
