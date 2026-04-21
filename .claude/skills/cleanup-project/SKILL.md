---
name: cleanup-project
description: Удаляет промежуточные файлы из projects/<name>/output/ — оставляет только 5 финальных файлов для публикации в Instagram (видео, обложка, caption, first_comment, hashtags). Запускать последним в пост-продакшне.
allowed-tools: Bash(python *)
---

# Skill: cleanup-project

Финальный шаг пост-продакшна. Оставляет в `projects/<name>/output/` ровно 5 файлов:

```
final_video_subs.mp4
cover_final.png
caption.txt
first_comment.txt
hashtags.txt
```

Всё остальное (transcripts, cover_candidates, slide versions, webm-бэкапы, analysis.json) удаляется.

## Usage
```bash
python .claude/skills/cleanup-project/cleanup.py projects/<name>/
```

## Флаги
- `--keep-transcripts` — оставить `transcript.txt`, `transcript.srt`, `subtitles.ass` (на случай ручной правки в CapCut)
- `--dry-run` — показать что будет удалено, не удалять

## Поведение
- Если `final_video_subs.mp4` отсутствует, но есть `recording_full.mp4` → переименовывает в `final_video_subs.mp4` (субтитры были пропущены)
- Идемпотентен: повторный запуск не падает, если файлы уже удалены
- Не трогает `assets/`, `01_trend.md`, `02_script.json` — только `output/`
