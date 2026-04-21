# /finish — Автомат пост-продакшна

После того как пользователь записал видео в Studio, `/finish` прогоняет **все** шаги пост-продакшна end-to-end и оставляет 5 файлов для публикации.

## Вход
- Аргумент (опционально): имя проекта, например `/finish 2026-04-20_my-reel`
- Если аргумент не задан — взять **последний** проект с непустым `output/recording_full.{mp4,webm}`

## Поток (без пауз кроме одной)

### 0. Подготовка видео
- Если в `projects/{name}/output/` есть `recording_full.webm` и **нет** `recording_full.mp4`:
  ```
  ffmpeg -y -i recording_full.webm -c:v libx264 -preset medium -crf 20 -c:a aac -b:a 128k recording_full.mp4
  ```
- Удалить `.webm` после успешной конвертации.

### 1. Transcribe (агент 6)
```bash
python .claude/skills/transcribe/transcribe.py projects/{name}/output/recording_full.mp4
```
Проверить, что создались `transcript_raw.txt`, `transcript.json`, `words_raw.json`. Затем создать исправленный `transcript.txt` + `transcript_corrections.md` (правки Whisper по кириллице, терминам).

### 2. Subtitle (агент 7)
```bash
python .claude/skills/subtitle/analyze_frame.py projects/{name}/output/recording_full.mp4
```
Прочитать `subtitle_placement.json`:
- `subtitles_enabled: true` → сгенерировать `subtitles.ass`/`.srt` и вшить:
  ```bash
  python .claude/skills/subtitle/generate_subs.py projects/{name}/output/
  python .claude/skills/subtitle/render_video.py projects/{name}/output/recording_full.mp4 projects/{name}/output/subtitles.ass
  ```
- `subtitles_enabled: false` → **пропустить вшивание**. Cleanup позже переименует `recording_full.mp4` в `final_video_subs.mp4`.

### 3. Analysis (агент 8)
Прочитать `transcript.txt`, `config/profile.md`. Создать `projects/{name}/output/analysis.json` по схеме (topic, slug, main_value, pain_point, content_category, cta_type, virality_score, next_content_ideas). Без внешних API.

### 4. Copywriter (агент 9)
Создать в `projects/{name}/output/`:
- `cover_text.json` — `{line1, line2, badge}` (белый + оранжевый)
- `caption.txt` — полный пост на русском с hook + CTA + 15-20 хэштегов
- `short_caption.txt` — до 150 символов
- `first_comment.txt` — 1-2 предложения провокация
- `hashtags.txt` — 15-20 хэштегов через пробел

### 5. Cover (агент 10) — **ЕДИНСТВЕННАЯ ПАУЗА**
1. `python .claude/skills/generate-cover/extract_frames.py projects/{name}/output/recording_full.mp4` — топ-3 кадра.
2. Прочитать `content_category` из `analysis.json` → выбрать папку:
   - `programming` / `ai` / `automation` / `tools` → `assets/photos/work/`
   - `productivity` / `motivation` → `assets/photos/portrait/`
   - остальное → `assets/photos/lifestyle/`
3. Показать пользователю **3 кадра из видео + 4-5 фото из библиотеки**. Попросить выбрать.
4. После выбора:
   ```bash
   python .claude/skills/generate-cover/generate_bg.py <выбранный_файл> --title "<line1> <line2>"
   python .claude/skills/generate-cover/overlay_text.py <cover_bg_generated.png> <cover_text.json>
   ```

### 6. Cleanup (последний)
```bash
python .claude/skills/cleanup-project/cleanup.py projects/{name}/
```
Оставляет в `output/` ровно 5 файлов.

## Финальный отчёт
Вывести компактную таблицу:

```
════════════════════════════════════════
  ГОТОВО ✓
════════════════════════════════════════
Проект: <name>
Длительность: <sec> сек

Пакет для Instagram:
  final_video_subs.mp4   (видео + субтитры + цветокоррекция)
  cover_final.png        (обложка 1080×1920)
  caption.txt            (описание поста)
  first_comment.txt      (первый комментарий)
  hashtags.txt           (хэштеги)

Открой папку: projects/<name>/output/
════════════════════════════════════════
```

## Правила
- **НИКАКИХ подтверждений** кроме выбора фото для обложки (шаг 5).
- При ошибке на любом шаге — вывести текст ошибки + предложить «повторить шаг X» / «пропустить». Не откатывать успешные шаги.
- Не переспрашивать имя проекта, если на диске только один подходящий.
- Не выводить отчёт каждого подагента — только итоговую таблицу в конце.
