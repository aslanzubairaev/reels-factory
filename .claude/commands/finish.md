# /finish — Быстрый пост-продакшн

После записи в Studio `/finish` собирает финальный пакет для Instagram **за ~2 минуты** (без субтитров) или **за ~8 минут** с флагом `--with-subs`.

## Вход
- Аргумент 1 (опционально): имя проекта. Если не задан — последний проект с файлами записи.
- Флаг `--with-subs` — включает субтитры (Transcribe + Subtitle). По умолчанию **выключено**.

## Шаги (4, плюс 2 опциональных)

### 0. Подготовка видео (ВСЕГДА)

**0a.** Если есть `recording_full.webm` и нет `recording_full.mp4`:
```
ffmpeg -y -i recording_full.webm -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -vsync cfr -r 30 -c:a aac -b:a 192k -ar 48000 -af aresample=async=1:first_pts=0 -movflags +faststart recording_full.mp4
```
(CFR + async-resample — иначе видео отстаёт от аудио.)

**0b.** Если в `output/` есть несколько `recording_NNN.mp4` и нет `recording_full.mp4` — **обязательно** запустить skill:
```bash
python .claude/skills/concat-segments/concat.py projects/{name}/output/
```
Самостоятельно `ffmpeg -filter_complex "fps=30,setpts=..."` **не использовать** — ломает синхрон. Skill сам выбирает stream-copy или re-encode с CFR.

**0c.** После успеха — не удалять сегменты вручную, их уберёт cleanup на шаге 4.

---

### [опционально при `--with-subs`] 1a. Transcribe
```bash
python .claude/skills/transcribe/transcribe.py projects/{name}/output/recording_full.mp4
```
Сверяет `transcript_raw.txt` со скриптом (`02_script.json`), исправляет ослышки → `transcript.txt` + `transcript_corrections.md`.

### [опционально при `--with-subs`] 1b. Subtitle
```bash
python .claude/skills/subtitle/analyze_frame.py projects/{name}/output/recording_full.mp4
```
Читает `subtitle_placement.json`:
- Если зона чистая → `generate_subs.py` + `render_video.py` → `final_video_subs.mp4`
- Если грязно → **пропускает вшивание** (не портит визуал)

---

### 2. Copywriter

Запустить агента **из `.claude/agents/copywriter-agent.md`**. Source — `02_script.json` (не transcript, не analysis.json).

Выход в `projects/{name}/output/`:
- `cover_text.json` — `{line1, line2}` (цепляющий хук)
- `caption.txt` — пост с hook + польза + CTA + 15-20 хэштегов
- `short_caption.txt` — до 150 символов
- `first_comment.txt` — провокация обсуждения
- `hashtags.txt` — теги через пробел

### 3. Cover — **ЕДИНСТВЕННАЯ ПАУЗА**

1. `python .claude/skills/generate-cover/extract_frames.py projects/{name}/output/recording_full.mp4` — 3 кадра.
2. Выбрать папку фото-библиотеки на основе темы в `02_script.json`:
   - код/AI/автоматизация/инструменты → `assets/photos/work/`
   - продуктивность/мотивация/привычки → `assets/photos/portrait/`
   - остальное → `assets/photos/lifestyle/`
3. Показать пользователю **3 кадра + 4-5 фото из библиотеки**, попросить выбрать.
4. После выбора:
   ```bash
   python .claude/skills/generate-cover/generate_bg.py <выбранный_файл> --title "<line1> <line2>"
   python .claude/skills/generate-cover/overlay_text.py <cover_bg_generated.png> <cover_text.json>
   ```

### 4. Cleanup
```bash
python .claude/skills/cleanup-project/cleanup.py projects/{name}/
```
Оставляет 5 файлов. Если субтитры не вшивались — переименовывает `recording_full.mp4` → `final_video_subs.mp4`.

## Финальный отчёт
```
════════════════════════════════════════
  ГОТОВО ✓
════════════════════════════════════════
Проект: <name>
Длительность: <sec> сек
Субтитры: вшиты / пропущены / не запрашивались

Пакет для Instagram:
  final_video_subs.mp4   (видео)
  cover_final.png        (обложка 1080×1920)
  caption.txt            (описание поста)
  first_comment.txt      (первый комментарий)
  hashtags.txt           (хэштеги)

Открой папку: projects/<name>/output/
════════════════════════════════════════
```

## Правила
- Пауза ровно одна — шаг 3 (выбор фото).
- На ошибке одного шага — вывести ошибку + «повторить» / «пропустить». Не откатывать успешные шаги.
- Не показывать отчёты каждого под-агента.
- Если `--with-subs` не передан — шаги 1a/1b пропускаются молча.
