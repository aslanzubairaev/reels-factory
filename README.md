# Reels Factory

Open-source multi-agent система для создания Instagram Reels «под ключ»: от поиска идей до готового пакета (видео + обложка + подпись + хэштеги).

Вся рабочая часть делается AI-CLI (Claude Code или Codex) + встроенной веб-студией. Один `/finish` — и у тебя на диске 5 файлов, готовых для публикации.

**Что умеет:**
- Подбирает идеи на основе трендов и твоей ниши
- Пишет сценарий и валидирует по JSON-схеме
- Генерирует фоны: HTML-слайды (локально), Gemini-фото, скринкаст твоего экрана
- Записывает видео через веб-студию с teleprompter'ом, записью по сегментам, safe-зонами Instagram
- Склеивает сегменты без рассинхрона A/V
- Делает обложку в едином бренд-стиле через Gemini + Pillow
- Генерирует caption, first_comment, hashtags
- Опциональные субтитры с анализом «чистой» зоны кадра

---

## Быстрый старт

```bash
# 1. Клонируй
git clone https://github.com/<username>/reels-factory.git
cd reels-factory

# 2. Установи зависимости
npm install
pip install -r requirements.txt

# 3. Скопируй .env.example → .env и вставь ключи (см. ниже)
cp .env.example .env

# 4. Запусти студию
npm run electron     # Desktop-приложение (рекомендуется)
# или
npm start            # Веб-версия на http://localhost:3000
```

Далее в встроенном терминале Studio (кнопка «💻 Терминал» или `Ctrl+` `) запускаешь `claude` или `codex` и говоришь «хочу идею для рилза».

---

## Требования

| Компонент | Минимальная версия | Зачем |
|---|---|---|
| **Node.js** | 18+ | Studio-сервер, Electron |
| **Python** | 3.9+ | Все skills (skills генерации, Whisper, Pillow) |
| **FFmpeg** | 6+ | Склейка сегментов, конвертация видео |
| **Chrome/Chromium** | — | Автоматически ставится Puppeteer для HTML-слайдов |
| **RAM** | 8 GB+ | Одновременно Puppeteer + FFmpeg + Whisper |
| **ОС** | Windows 10+, macOS 12+, Ubuntu 20.04+ | Electron desktop работает только на Windows/macOS |

Дополнительно нужен либо **Claude Code CLI** (`npm install -g @anthropic-ai/claude-code`), либо **Codex CLI** (`npm install -g @openai/codex`) для AI-оркестрации.

---

## API-ключи

Создай `.env` из `.env.example` и заполни:

| Ключ | Сервис | Обязательно? | Где взять |
|---|---|---|---|
| `GEMINI_API_KEY` | Google Gemini (фоны, обложки) | **Да** для AI-фонов и обложек | [aistudio.google.com](https://aistudio.google.com) |
| `ANTHROPIC_API_KEY` | Anthropic (перевод промптов, ai-slide-data) | Только если юзаешь `/api/generate` и HTML-слайды с AI | [console.anthropic.com](https://console.anthropic.com) |
| `PIAPI_KEY` | PiAPI / Seedance (AI-видео) | Нет | [piapi.ai](https://piapi.ai) |
| `OPENAI_API_KEY` | OpenAI (DALL-E fallback) | Нет | [platform.openai.com](https://platform.openai.com) |

**Важно про Gemini:** для генерации изображений нужен **включённый биллинг** в Google Cloud Console. Бесплатный тариф image generation не поддерживает.

**Что если не хочу платить за API:** можешь полностью обойтись подпиской Claude/ChatGPT + `face_only` / `screen_capture` / `html_slide` фонами. Единственное место где нужен Gemini — AI-обложка; её можно заменить на фото из библиотеки с локальным наложением текста.

---

## Типовой workflow

```
Ты: "Хочу идею для рилза про продуктивность"
  ↓ Trend Agent: показывает 5 идей, выбираешь
  ↓ Script Agent: пишет сценарий на 6-7 частей → 02_script.json
  ↓ Visual Agent: создаёт фоны (HTML-слайды + screen_capture точки + 1-2 AI-фото)

Ты открываешь Studio → записываешь видео → «Сохранить»

Ты: "/finish"
  ↓ concat-segments: склеивает сегменты → recording_full.mp4
  ↓ Copywriter: caption + hashtags + cover_text из 02_script.json
  ↓ Cover: показывает 3 кадра + 5 фото из библиотеки, выбираешь
  ↓      Gemini редактирует фон в бренд-стиле → Pillow накладывает текст
  ↓ Cleanup: удаляет промежуточные файлы

В итоге в projects/<имя>/output/ ровно 5 файлов:
  final_video_subs.mp4  ← видео
  cover_final.png       ← обложка 1080×1920
  caption.txt           ← подпись + хэштеги
  first_comment.txt     ← провокация для алгоритма
  hashtags.txt          ← теги отдельно
```

С субтитрами — `/finish --with-subs` (добавляет ~5 минут на Whisper + анализ кадра + вшивание).

---

## Структура проекта

```
reels-factory/
├── .claude/
│   ├── agents/               # Инструкции агентов (.md)
│   ├── skills/               # Python-скрипты для API (generate-photo, subtitle, ...)
│   ├── commands/finish.md    # Оркестратор пост-продакшна
│   └── hooks/bash/           # Защита от коммита .env
├── studio/
│   ├── server.js             # Express-сервер
│   ├── routes/               # API (/api/project, /api/generate, /api/record, ...)
│   ├── public/               # Frontend (HTML + JS + CSS)
│   ├── lib/                  # Утилиты (runtime-paths, projects)
│   └── templates/            # HTML-шаблоны для слайдов
├── electron/
│   ├── main.js               # Electron main process
│   ├── preload.js            # Безопасный мост window.terminalAPI
│   └── ai-backends.json      # Конфиг AI-CLI (claude/codex/shell)
├── assets/
│   └── photos/               # Фото автора {work, portrait, lifestyle}
├── projects/                 # Проекты рилзов (gitignored)
├── schemas/script.schema.json
├── CLAUDE.md                 # Главные инструкции для Claude
├── AGENTS.md                 # Индекс для любого AI-CLI
└── README.md
```

---

## Настройка профиля (опционально)

Создай `config/profile.md` с описанием себя: имя, ниша, стиль, аудитория, CTA-предпочтения. Агенты будут учитывать это при генерации.

Пример:
```markdown
# Автор

- Имя: Иван
- Ниша: Productivity, AI-инструменты
- Тон: экспертный, прямой, без воды
- CTA по умолчанию: «напиши KEYWORD в комменты»
- Русскоязычная аудитория, мужчины 25-35
```

---

## Безопасность

- `.env` — никогда не коммитится (в `.gitignore` + pre-commit hook `.claude/hooks/bash/protect-env.sh`)
- CORS в Studio ограничен `localhost` — API не доступен извне
- CSP headers на всех HTTP-ответах
- Electron: `contextIsolation: true`, `nodeIntegration: false`, whitelist команд для terminal:spawn через `electron/ai-backends.json`
- Все пути к проектам валидируются через `assertSafeProjectName` (защита от path traversal)
- Дочерние процессы получают только нужные env-переменные (не весь environment)

---

## Команды

```bash
npm start            # Studio-сервер на :3000
npm run electron     # Desktop-приложение (Windows/Mac)
npm run build:win    # NSIS инсталлятор Windows
```

---

## Лицензия

MIT — см. `LICENSE`.

## Автор

Автор: [Aslan](https://github.com/<username>)

Контрибуции и pull requests приветствуются. Для багов — открывай issue с логами.
