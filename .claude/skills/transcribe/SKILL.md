---
name: transcribe
description: Транскрибирует видео через OpenAI Whisper (модель medium, язык ru). Создает текст, сегменты с таймкодами и пословные таймкоды.
arguments:
  - name: video_path
    description: Путь к видеофайлу (MP4)
    required: true
---

# Скилл: Транскрипция видео

## Использование
```bash
python .claude/skills/transcribe/transcribe.py <video_path>
```

## Выход (в той же папке что и видео)
- `transcript_raw.txt` — сырой текст
- `transcript.json` — сегменты `[{start, end, text}]`
- `words_raw.json` — пословные таймкоды `[{word, start, end}]`

## Зависимости
- `openai-whisper` (`pip install openai-whisper`)
- FFmpeg в PATH
