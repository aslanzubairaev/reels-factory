---
name: concat-segments
description: Склеивает сегменты записи (recording_001.mp4, recording_002.mp4, ...) в один recording_full.mp4 без рассинхрона аудио/видео. Использовать сразу после записи, если в output/ больше одного recording_NNN.mp4.
allowed-tools: Bash(python *)
---

# Skill: concat-segments

Собирает все файлы `recording_NNN.mp4` из `projects/<name>/output/` в один `recording_full.mp4`.

## Usage
```bash
python .claude/skills/concat-segments/concat.py projects/<name>/output/
```

## Зачем нужен

MediaRecorder в браузере пишет VFR (variable frame rate). Если склеивать сегменты наивной командой с `-filter_complex "fps=30,setpts=..."`, видео пересэмплится, а аудио — нет → видео отстаёт от голоса.

Skill делает правильно:
1. Если все сегменты имеют идентичные кодек/разрешение/fps — использует `-c copy` (stream-copy без перекодирования, гарантирует синхрон).
2. Иначе fallback на аккуратное перекодирование с `-vsync cfr -r 30 -af aresample=async=1` — выравнивает timestamps без дрейфа.

## Поведение
- Если `recording_full.mp4` уже существует — skill не трогает его (используй `--force` для переcклейки).
- После успеха: оригинальные `recording_NNN.mp4` **не удаляются** (cleanup-project удалит их позже).
- Если сегмент только один — просто переименовывает его в `recording_full.mp4`.

## Флаги
- `--force` — переcклеить, даже если `recording_full.mp4` есть.
