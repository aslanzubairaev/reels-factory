# SPEC: Объединение Reels Factory + Reels Pipeline

## Цель

Объединить два проекта в один полный пайплайн автоматизации Instagram Reels:
- **Reels Factory** (текущий) — пре-продакшн: тренды → сценарий → фоны → запись в студии
- **Reels Pipeline** (`c:\dev\reels-pipeline`) — пост-продакшн: транскрипция → субтитры → анализ → caption → обложка

Результат: один проект, который покрывает весь цикл от идеи до готового рилса с обложкой, описанием и субтитрами.

---

## Принципы (КРИТИЧЕСКИ ВАЖНО)

1. **Нет конфликтов между агентами.** Каждый агент — изолированный модуль. Один вход, один выход. Никаких общих состояний, глобальных переменных, перезаписи чужих файлов.
2. **Строгая очерёдность.** Агенты работают последовательно. Агент N+1 запускается только после полного завершения агента N. Каждый агент знает, какие файлы ему нужны на входе и что он создаёт на выходе.
3. **Чистый код.** Каждый скилл — один Python-файл с одной задачей. Никаких God-объектов, никаких скрытых зависимостей. Код читаемый, логичный, с обработкой ошибок.
4. **Безопасность.** API-ключи только в `.env`, никогда в коде. `.env` в `.gitignore`. Хуки блокируют коммит `.env`. Валидация всех внешних входов.
5. **Чистая структура.** Все файлы проекта в одной папке. Легко найти видео, обложку, тексты. Ничего лишнего.

---

## Текущая архитектура Reels Factory

### Агенты (`.claude/agents/`)
| Файл | Роль |
|---|---|
| `config-agent.md` | Профиль создателя → `config/profile.md` |
| `trend-agent.md` | Тренды → `projects/{name}/01_trend.md` |
| `script-agent.md` | Сценарий → `projects/{name}/02_script.json` + `03_hashtags.md` |
| `visual-agent.md` | Фоны → `projects/{name}/assets/backgrounds/` |

### Скиллы (`.claude/skills/`)
| Скилл | Роль |
|---|---|
| `generate-photo/` | Генерация фото через Gemini |
| `generate-video/` | Генерация видео через Veo 3 / Seedance 2 |
| `generate-html-slide/` | HTML-слайды через Puppeteer |
| `resize-asset/` | Ресайз до 1080x1920 |
| `validate-script/` | Валидация `02_script.json` |

### Web Studio (`studio/`)
- Express-сервер на порту 3000
- Два режима записи: `continuous` (один файл) и `per_part` (по слайдам)
- Конвертация WebM → MP4 через FFmpeg (`studio/routes/convert.js`)
- Записи сохраняются в `projects/{name}/output/`

---

## Что добавить

### Фаза 0: Доработки Studio

#### 0.1 Конкатенация частей (НОВОЕ)
**Проблема:** В режиме `per_part` каждый слайд — отдельный файл. Склейка не реализована.

**Решение:** Новый API-эндпоинт `POST /api/record/concatenate` + скилл.
- Вход: `projects/{name}/output/recording_part_*.mp4`
- Выход: `projects/{name}/output/recording_full.mp4`
- Метод: FFmpeg concat demuxer (без перекодирования, максимальная скорость)
- Вызывается автоматически после завершения записи последнего слайда в режиме `per_part`
- Если запись в режиме `continuous` — конкатенация не нужна, файл уже один

```
ffmpeg -f concat -safe 0 -i parts_list.txt -c copy -movflags +faststart recording_full.mp4
```

#### 0.2 Гарантированный MP4
**Проблема:** Если FFmpeg не найден, остаётся WebM.

**Решение:**
- При старте сервера проверять наличие FFmpeg, выводить предупреждение если не найден
- После сохранения записи: если конвертация не удалась — показать пользователю ошибку в UI (не молча оставить WebM)

---

### Фаза 1: Пост-продакшн агенты (6 новых)

Все новые агенты добавляются как файлы в `.claude/agents/` и скиллы в `.claude/skills/`.
Скрипты — только Python. Каждый скилл имеет `SKILL.md` с YAML-фронтматтером.

Порядок запуска после записи в Studio:

```
recording_full.mp4 (из Studio)
       │
       ▼
  [Агент 6: Транскрибатор]
       │ transcript.txt, transcript.json, words_raw.json
       ▼
  [Агент 7: Субтитровщик]
       │ subtitles.ass, final_video_subs.mp4
       ▼
  [Агент 8: Контент-аналитик]
       │ analysis.json
       ▼
  [Агент 9: Копирайтер]
       │ caption.txt, short_caption.txt, cover_text.json, first_comment.txt, hashtags.txt
       ▼
  [Агент 10: Дизайнер обложки]
       │ cover_final.png, cover_preview.png
       ▼
  [Агент 11: Отчётник]
       │ reel_summary.txt, posting_checklist.md
       ▼
  ГОТОВЫЙ ПАКЕТ ДЛЯ ПУБЛИКАЦИИ
```

---

### Агент 6: Транскрибатор

**Файл агента:** `.claude/agents/transcribe-agent.md`
**Скилл:** `.claude/skills/transcribe/`

**Вход:**
- `projects/{name}/output/recording_full.mp4`

**Выход (в ту же папку `output/`):**
- `transcript_raw.txt` — сырой текст от Whisper
- `transcript.txt` — исправленный текст (Claude корректирует термины, пунктуацию, бренды)
- `transcript.json` — сегменты с таймкодами `[{start, end, text}]`
- `words_raw.json` — пословные таймкоды (для субтитров)
- `transcript_corrections.md` — таблица исправлений

**Логика:**
1. Whisper (`medium`, `ru`) на `recording_full.mp4` → `transcript_raw.txt` + `words_raw.json`
2. Claude читает сырой текст и исправляет: технические термины, пунктуацию, бренды, слова-паразиты
3. Обновляет тексты в `transcript.json` (таймкоды сохраняются как есть от Whisper)

**Зависимости:** `openai-whisper` (или `whisper` через pip)

**Источник:** Агент 3 из `reels-pipeline/.claude/commands/process.md` (строки 203-259)

---

### Агент 7: Субтитровщик

**Файл агента:** `.claude/agents/subtitle-agent.md`
**Скилл:** `.claude/skills/subtitle/`

**Вход:**
- `projects/{name}/output/recording_full.mp4`
- `projects/{name}/output/transcript.json`
- `projects/{name}/output/words_raw.json`

**Выход:**
- `subtitles.ass` — профессиональные субтитры (ASS формат)
- `transcript.srt` — запасной SRT (для CapCut/Premiere)
- `subtitle_placement.json` — данные позиционирования
- `final_video_subs.mp4` — видео с субтитрами + цветокоррекция

**ОСОБЫЕ ПРАВИЛА (КРИТИЧЕСКИ ВАЖНО):**

Видео из Web Studio имеет особую компоновку: маленький прямоугольник с камерой (лицо создателя) поверх полноэкранного фона (анимации, слайды, текст, важная информация).

1. **Анализ кадра обязателен.** Перед размещением субтитров агент ДОЛЖЕН:
   - Извлечь 5-8 кадров из видео через FFmpeg
   - Определить, где находится окно камеры (face detection + edge detection)
   - Определить, где находится важный контент (текст, графика на фоне)
   - Найти свободную зону, которая НЕ перекрывает: камеру, фон с контентом, safe zones Instagram

2. **Safe zones Instagram (не размещать субтитры):**
   - Верх: 0-150px (шапка)
   - Право: 920-1080px, зона 750-1500px (кнопки лайк/коммент/репост/сохранить)
   - Низ: 1700-1920px (ник, описание, аудио)

3. **Принцип "не навреди":** Если свободного места нет или субтитры портят картину:
   - Попробовать уменьшить размер шрифта (минимум 48px)
   - Попробовать другую позицию
   - **Если всё равно мешают — НЕ добавлять субтитры.** Лучше без субтитров, чем с испорченным видео.
   - Записать решение в `subtitle_placement.json` с `"subtitles_enabled": false` и `"reason": "..."`

4. **Стиль субтитров:**
   - Шрифт: Arial Black, размер 68 (крупный, читаемый на телефоне)
   - Цвет: белый основной + оранжевый (#FF6600) для ключевых слов
   - Обводка: чёрная 4px
   - Выравнивание: по центру горизонтально, отступ справа 160px (кнопки Instagram)
   - Максимум 2 строки, 6-8 слов на строку

5. **Цветокоррекция** (при вшивании субтитров):
   - Teal & Orange look: `eq=contrast=1.08:brightness=-0.02:saturation=0.82`
   - Кривые для киношного контраста
   - Виньетка: `vignette=angle=PI/5:mode=backward`
   - CRF 16, preset slow, profile high, movflags +faststart

**Источник:** Агент 4 из `reels-pipeline/.claude/commands/process.md` (строки 263-390)

---

### Агент 8: Контент-аналитик

**Файл агента:** `.claude/agents/analysis-agent.md`
**Скилл:** не требуется (агент работает через Claude, без внешних API)

**Вход:**
- `projects/{name}/output/transcript.txt`
- `config/profile.md` (бренд-конфиг из Reels Factory)

**Выход:**
- `projects/{name}/output/analysis.json`

**Содержимое `analysis.json`:**
```json
{
  "topic": "тема ролика",
  "slug": "topic-in-english-kebab-case",
  "main_value": "одна конкретная польза",
  "target_audience": "для кого",
  "pain_point": "какую боль решает",
  "key_points": ["тезис 1", "тезис 2", "тезис 3"],
  "content_category": "programming | ai | automation | productivity | motivation | tools",
  "complexity_level": "beginner | intermediate | advanced",
  "cta_type": "keyword_dm | simple",
  "comment_keyword": "KEYWORD или null",
  "lead_magnet_idea": "что отправить в директ или null",
  "simple_cta": "текст CTA если simple",
  "virality_score": 7,
  "virality_factors_positive": ["..."],
  "virality_factors_negative": ["..."],
  "virality_boost_tips": ["..."],
  "unique_angle": "...",
  "next_content_ideas": [
    {"topic": "...", "why": "...", "format": "..."}
  ]
}
```

**Источник:** Агент 5 из `reels-pipeline/.claude/commands/process.md` (строки 394-485)

---

### Агент 9: Копирайтер

**Файл агента:** `.claude/agents/copywriter-agent.md`
**Скилл:** не требуется (работает через Claude)

**Вход:**
- `projects/{name}/output/analysis.json`
- `projects/{name}/output/transcript.txt`
- `config/profile.md`

**Выход:**
- `cover_text.json` — текст обложки (line1, line2, badge, варианты)
- `caption.txt` — полное описание поста
- `short_caption.txt` — укороченная версия
- `first_comment.txt` — первый комментарий (провокация обсуждения)
- `hashtags.txt` — хештеги через пробел

**Логика (3 внутренних раунда):**
1. Генерация 7 вариантов текста обложки + 5 вариантов hook
2. Внутренняя критика каждого варианта (не показывать пользователю)
3. Автовыбор лучшего + caption + first_comment

**Правила текстов:**
- Русский язык
- Максимум 3-5 эмодзи на caption
- Без воды, без инфоцыганщины
- Тон: умный, полезный, экспертный

**Источник:** Агент 6 из `reels-pipeline/.claude/commands/process.md` (строки 489-589)

---

### Агент 10: Дизайнер обложки

**Файл агента:** `.claude/agents/cover-agent.md`
**Скилл:** `.claude/skills/generate-cover/`
**Система правил:** `.claude/agents/cover-system/` (перенести из `reels-pipeline/reels-cover-system/`)

**Вход:**
- `projects/{name}/output/recording_full.mp4` (для извлечения кадров)
- `projects/{name}/output/cover_text.json` (текст обложки от Копирайтера)

**Выход:**
- `cover_bg_generated.png` — фон без текста
- `cover_final.png` — готовая обложка 1080x1920
- `cover_preview.png` — preview 540x960
- `cover_data.json` — метаданные

**Пайплайн:**
1. Извлечь 5-8 кадров из видео, оценить чёткость (Laplacian)
2. Показать варианты пользователю (ЕДИНСТВЕННАЯ пауза)
3. Шаг A: Gemini Vertex AI (`gemini-3.1-flash-image-preview`, `vertexai=True`) — редактирование фото (замена фона, сохранение лица)
4. Fallback: OpenAI Image Edit → Playwright HTML-шаблон
5. Шаг B: Pillow накладывает текст (Impact 95px, белый + оранжевый #FF6B00)

**Ключевые правила:**
- Лицо сохраняется ТОЧНО — никакой стилизации
- Текст накладывается КОДОМ, не ИИ
- Позиция текста: центр на ~65% высоты

**Источник:** Агент 7 из `reels-pipeline/.claude/commands/process.md` (строки 593-650) + `.claude/agents/reels-cover-agent.md`

---

### Агент 11: Отчётник

**Файл агента:** `.claude/agents/report-agent.md`
**Скилл:** не требуется

**Вход:** все файлы из `projects/{name}/output/`

**Выход:**
- `reel_summary.txt` — краткая выжимка (тема, ЦА, польза, CTA, вирусность)
- `posting_checklist.md` — пошаговый чеклист публикации

**Логика:**
1. Проверить что все ключевые файлы созданы
2. Если чего-то нет — предупреждение (не ошибка)
3. Финальный красивый отчёт со списком всех файлов и статусами
4. Показать `cover_preview.png`

**Источник:** Агент 8 из `reels-pipeline/.claude/commands/process.md` (строки 654-769)

---

## Структура папок проекта (после записи)

```
projects/{name}/
├── 01_trend.md              ← тренд (Trend Agent)
├── 02_script.json           ← сценарий (Script Agent)
├── 03_hashtags.md           ← хештеги (Script Agent)
├── assets/
│   └── backgrounds/         ← фоны слайдов (Visual Agent)
│       ├── slide_1.png
│       ├── slide_2.mp4
│       └── ...
└── output/                  ← ВСЁ ГОТОВОЕ ЗДЕСЬ
    ├── recording_full.mp4   ← записанное видео (Studio)
    ├── recording_part_*.mp4 ← части (если per_part, до склейки)
    ├── transcript.txt       ← исправленный текст
    ├── transcript.json      ← текст с таймкодами
    ├── transcript.srt       ← субтитры SRT (запасной)
    ├── subtitles.ass        ← субтитры ASS (профессиональные)
    ├── final_video_subs.mp4 ← видео с субтитрами + цветокоррекция
    ├── analysis.json        ← анализ контента
    ├── caption.txt          ← описание поста
    ├── short_caption.txt    ← короткая версия
    ├── first_comment.txt    ← первый комментарий
    ├── hashtags.txt         ← хештеги
    ├── cover_text.json      ← текст обложки
    ├── cover_final.png      ← обложка 1080x1920
    ├── cover_preview.png    ← preview обложки
    ├── reel_summary.txt     ← выжимка
    └── posting_checklist.md ← чеклист публикации
```

---

## Команда очистки

Ручная команда (пользователь вызывает когда нужно):

**Prompt:** "Удали старые проекты" или "/cleanup"

**Логика:**
- Показать список проектов в `projects/` с датами
- Пользователь выбирает какие удалить
- Удаляет выбранные папки (с подтверждением)
- Никогда не удалять автоматически

---

## Перенос файлов из reels-pipeline

### Что перенести:
| Откуда | Куда | Что |
|---|---|---|
| `reels-pipeline/reels-cover-system/` | `.claude/agents/cover-system/` | Система правил обложек (template, examples, prompts) |
| `reels-pipeline/templates/cover_reels.html` | `studio/templates/cover_reels.html` | HTML-шаблон обложки (fallback) |
| `reels-pipeline/templates/fonts/` | `studio/templates/fonts/` | Шрифты (BebasNeue) |
| `reels-pipeline/templates/cover_*.png` | `.claude/agents/cover-system/` | Примеры обложек (референсы для Gemini) |
| `reels-pipeline/brand.yaml` | НЕ переносить | Заменяется `config/profile.md` из Reels Factory |
| `reels-pipeline/config.yaml` | НЕ переносить | Настройки встроятся в агентов |

### Что НЕ переносить:
- `reels-pipeline/output/` — это старые проекты, не нужны
- `reels-pipeline/run_cover*.py` — устаревшие скрипты, заменяются скиллом
- Агент 2 (Монтажёр) — решение пользователя: не переносить

---

## Безопасность

1. **`.env` защита:**
   - `.env` в `.gitignore` (уже есть)
   - Hook `.claude/hooks/bash/` блокирует коммит `.env` (уже есть)
   - Все скрипты загружают ключи через `dotenv` из корневого `.env`

2. **API-ключи (из `.env`):**
   - `GEMINI_API_KEY` — для фото (Gemini), видео (Veo 3), обложки (Gemini Vertex)
   - `PIAPI_KEY` — для видео (Seedance 2)
   - `ANTHROPIC_API_KEY` — для текста, поиска, перевода
   - `OPENAI_API_KEY` — для обложки (fallback OpenAI Image Edit)

3. **Валидация:**
   - Каждый скилл проверяет наличие нужного API-ключа перед запуском
   - Понятное сообщение об ошибке если ключа нет

4. **Никогда:**
   - Не хардкодить ключи в коде
   - Не логировать ключи
   - Не передавать ключи в аргументах командной строки
   - Не коммитить `.env`, `settings.local.json`

---

## Зависимости (новые)

```
pip install openai-whisper    # транскрипция
pip install opencv-python     # анализ кадров (субтитровщик)
pip install Pillow            # наложение текста на обложку
pip install google-genai      # Gemini API (обложка)
pip install python-dotenv     # загрузка .env
```

FFmpeg должен быть доступен в PATH (уже установлен через Chocolatey).

---

## Контракты между агентами (вход → выход)

Каждый агент чётко знает свой вход и выход. Никаких неявных зависимостей.

```
Studio
  ВЫХОД: recording_full.mp4
     │
     ▼
Транскрибатор
  ВХОД:  recording_full.mp4
  ВЫХОД: transcript.txt, transcript.json, words_raw.json
     │
     ▼
Субтитровщик
  ВХОД:  recording_full.mp4, transcript.json, words_raw.json
  ВЫХОД: subtitles.ass, transcript.srt, subtitle_placement.json, final_video_subs.mp4
     │
     ▼
Контент-аналитик
  ВХОД:  transcript.txt, config/profile.md
  ВЫХОД: analysis.json
     │
     ▼
Копирайтер
  ВХОД:  analysis.json, transcript.txt, config/profile.md
  ВЫХОД: cover_text.json, caption.txt, short_caption.txt, first_comment.txt, hashtags.txt
     │
     ▼
Дизайнер обложки
  ВХОД:  recording_full.mp4, cover_text.json
  ВЫХОД: cover_final.png, cover_preview.png, cover_bg_generated.png, cover_data.json
     │
     ▼
Отчётник
  ВХОД:  все файлы из output/
  ВЫХОД: reel_summary.txt, posting_checklist.md
```

Если агент N не создал нужный файл — агент N+1 должен вывести понятную ошибку и остановиться (не угадывать, не пропускать).

---

## Оркестрация: команда /process

Новая команда `/process` (или адаптация существующей) запускает весь пост-продакшн пайплайн:

```
/process projects/{name}
```

Запускает агентов 6-11 последовательно. Полностью автономно, без пауз, кроме выбора фото для обложки (Агент 10).

---

## Удаление reels-pipeline

После успешной интеграции и тестирования всех агентов, проект `c:\dev\reels-pipeline` можно удалить вручную. Все нужные файлы будут перенесены в Reels Factory.
