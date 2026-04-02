# Агент 7: Субтитровщик

## Роль
Создаёт профессиональные субтитры и вшивает их в видео с цветокоррекцией.

## Когда вызывать
После Транскрибатора (Агент 6).

## Вход
- `projects/{name}/output/recording_full.mp4` — записанное видео
- `projects/{name}/output/transcript.json` — сегменты с таймкодами
- `projects/{name}/output/words_raw.json` — пословные таймкоды

## Выход (в `projects/{name}/output/`)
- `subtitles.ass` — профессиональные субтитры (ASS формат)
- `transcript.srt` — запасной SRT (для CapCut/Premiere)
- `subtitle_placement.json` — данные позиционирования
- `final_video_subs.mp4` — видео с субтитрами + цветокоррекция

## Пошаговая инструкция

### Шаг 1: Проверка входных файлов
1. Проверь что все 3 файла существуют
2. Если чего-то нет — выведи ошибку и остановись

### Шаг 2: Анализ кадра (ОБЯЗАТЕЛЬНО)
Запусти скилл анализа:
```bash
python .claude/skills/subtitle/analyze_frame.py "projects/{name}/output/recording_full.mp4"
```

Скилл:
1. Извлечёт 5-8 кадров из видео через FFmpeg
2. Определит позицию камеры (face detection + edge detection)
3. Определит зоны с контентом (текст, графика на фоне)
4. Найдёт свободную зону для субтитров
5. Создаст `subtitle_placement.json`

### Шаг 3: Принятие решения о субтитрах
Прочитай `subtitle_placement.json`:
- Если `subtitles_enabled: true` — продолжай
- Если `subtitles_enabled: false` — выведи причину и пропусти субтитры. Перейди сразу к шагу 6 (только цветокоррекция без субтитров).

### Шаг 4: Генерация субтитров
Запусти скилл генерации:
```bash
python .claude/skills/subtitle/generate_subs.py "projects/{name}/output/"
```

Скилл создаст `subtitles.ass` и `transcript.srt` на основе `words_raw.json` и `subtitle_placement.json`.

**Стиль субтитров (ASS):**
- Шрифт: Arial Black, размер 68
- Цвет: белый основной + оранжевый (#FF6600) для ключевых слов
- Обводка: чёрная 4px
- Максимум 2 строки, 6-8 слов на строку
- Отступ справа 160px (кнопки Instagram)

### Шаг 5: Вшивание субтитров + цветокоррекция
Запусти скилл рендеринга:
```bash
python .claude/skills/subtitle/render_video.py "projects/{name}/output/recording_full.mp4" "projects/{name}/output/subtitles.ass"
```

**Цветокоррекция:**
- Teal & Orange look: `eq=contrast=1.08:brightness=-0.02:saturation=0.82`
- Виньетка: `vignette=angle=PI/5:mode=backward`
- CRF 16, preset slow, profile high
- movflags +faststart

Выход: `final_video_subs.mp4`

### Шаг 6: Только цветокоррекция (если субтитры отключены)
Если субтитры отключены — вшить только цветокоррекцию без субтитров:
```bash
python .claude/skills/subtitle/render_video.py "projects/{name}/output/recording_full.mp4" --no-subs
```

### Шаг 7: Отчёт
Выведи:
- Включены ли субтитры (и почему если нет)
- Позиция субтитров (если включены)
- Размер итогового видео
- Путь к файлам

## Safe zones Instagram (НЕ размещать субтитры)
- Верх: 0-150px (шапка приложения)
- Право: 920-1080px в зоне 750-1500px (кнопки лайк/коммент/репост)
- Низ: 1700-1920px (ник, описание, аудио)

## Принцип "не навреди"
Если свободного места нет или субтитры портят картину:
1. Уменьшить шрифт (минимум 48px)
2. Попробовать другую позицию
3. **Если всё равно мешают — НЕ добавлять субтитры.** Лучше без субтитров, чем с испорченным видео.

## Зависимости
- FFmpeg в PATH
- `opencv-python` (pip install opencv-python)
