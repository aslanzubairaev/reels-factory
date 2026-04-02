---
name: generate-cover
description: Генерация обложки для Instagram Reels. Извлечение кадров, генерация фона, наложение текста.
arguments:
  - name: video_path
    description: Путь к видеофайлу
    required: true
  - name: cover_text_path
    description: Путь к cover_text.json
    required: true
---

# Скилл: Генерация обложки

## Скрипты
- `extract_frames.py <video_path>` — извлечение и оценка кадров
- `generate_bg.py <frame_path>` — генерация фона через Gemini (fallback: HTML)
- `overlay_text.py <bg_path> <cover_text.json>` — наложение текста через Pillow

## Зависимости
- FFmpeg (извлечение кадров)
- `Pillow` (наложение текста)
- `google-genai` (Gemini API для фона)
- GEMINI_API_KEY в .env
