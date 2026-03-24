# Script Agent — Написание сценариев

## Когда активируется

Пользователь утвердил идею и говорит: «Напиши сценарий», «Сценарий на русском»

## Входные данные

1. Утверждённая идея — `projects/[name]/01_trend.md`
2. Профиль — `config/profile.md` (если есть)
3. Язык — спроси если не указан

## Шаг 1: 2-3 варианта сценария (НОВОЕ v2)

Сгенерируй 2-3 варианта с разными подходами (серьёзный, юмористический, провокационный). Покажи краткое описание каждого. Пользователь выбирает.

## Шаг 2: Генерация `02_script.json`

Создай JSON строго по schema. Правила:

- Гибкое количество частей (обычно 4-7)
- Общая длительность ≤ 90 секунд
- `background_prompt` — всегда на АНГЛИЙСКОМ
- `background_prompt_display` — на языке пользователя (НОВОЕ v2)
- face_only → `background_type: "none"`, `background_prompt: ""`

### Обязательные суффиксы для промптов фонов (НОВОЕ v2)

Каждый промпт ОБЯЗАН содержать:
```
background plate for talking head video, soft even lighting,
no harsh shadows, no foreground objects, color palette compatible
with indoor skin tones, 9:16 vertical portrait orientation
```

### Layout

- `face_only` — хуки, эмоции, CTA. Камера на весь экран.
- `full_background` — демонстрация, примеры. Маленькая камера.
- `partial_background` — основной контент. Камера крупно, фон частично.

## Шаг 3: Hook Analyzer (НОВОЕ v2)

После генерации — оцени первые 3 секунды (hook):
- Оценка: «Hook остановит скролл на X/10»
- Объяснение почему
- 2-3 предложения по усилению

## Шаг 4: CTA Generator (НОВОЕ v2)

Предложи 3 варианта Call-to-Action для конца рилса:
- Вариант 1: [текст] — [почему эффективен]
- Вариант 2: [текст] — [почему эффективен]
- Вариант 3: [текст] — [почему эффективен]

Пользователь выбирает или пишет свой.

## Шаг 5: Валидация

```bash
python3 .claude/skills/validate-script/validate.py projects/[name]/02_script.json
```

## Шаг 6: Показ и утверждение

Покажи в читаемом виде. Жди — пользователь должен утвердить сценарий.

**Перед изменениями** — версионируй: `python3 utils/version_file.py projects/[name]/02_script.json`

## Шаг 7: Хэштеги (НОВОЕ v2)

После утверждения сценария — сгенерируй 20-30 хэштегов в `projects/[name]/03_hashtags.md`:

```markdown
# Хэштеги для Reel

## Основные (5)
#hashtag1 #hashtag2 ...

## Нишевые (10)
#hashtag3 #hashtag4 ...

## Трендовые (5-10)
#hashtag5 #hashtag6 ...

## Готовая строка для копирования
#hashtag1 #hashtag2 #hashtag3 ...
```

## Важно

- Сумма timing_seconds = total_duration_seconds
- total_duration_seconds ≤ 90
- Текст звучит естественно при чтении вслух
