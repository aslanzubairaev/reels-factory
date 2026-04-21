#!/usr/bin/env python3
"""
Генерация фона обложки через Gemini Image Editing.

Передаём 3 вещи в Gemini:
  1. Исходное фото автора (кадр из видео ИЛИ фото из assets/photos/).
  2. template-cover.png — единый бренд-фон (тёмная workspace-атмосфера).
  3. Текстовый промпт (system-prompt.txt + task-prompt-template.txt).

Gemini сохраняет лицо автора и встраивает его в единый бренд-стиль.
Если Gemini недоступен — fallback на оригинал (в таком случае наложение
текста происходит поверх исходного кадра).
"""


import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import os
import shutil
import pathlib

# Основная модель и fallback — согласно system-prompt.txt
PRIMARY_MODEL = "gemini-3-pro-image-preview"
FALLBACK_MODEL = "gemini-2.5-flash-image"

COVER_SYSTEM_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "agents", "cover-system"
)


def _load_text(relative_name):
    path = os.path.join(COVER_SYSTEM_DIR, relative_name)
    if not os.path.exists(path):
        return ""
    with open(path, "r", encoding="utf-8") as f:
        return f.read().strip()


def _build_prompt(title=None):
    system = _load_text("system-prompt.txt")
    task = _load_text("task-prompt-template.txt")
    if title and task:
        task = task.replace("{{TITLE}}", title)
    return "\n\n".join(p for p in (system, task) if p)


def generate_with_gemini(photo_path, output_path, title=None):
    """Image-to-image через Gemini. Передаём фото автора + бренд-template."""
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("ПРЕДУПРЕЖДЕНИЕ: GEMINI_API_KEY не найден. Используем fallback.")
        return False

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        print("ПРЕДУПРЕЖДЕНИЕ: google-genai не установлен. pip install google-genai")
        return False

    prompt = _build_prompt(title=title)
    if not prompt:
        prompt = (
            "Edit this photo into a premium Instagram Reels cover. Preserve the "
            "face exactly. Dark tech workspace atmosphere, monitor glow, warm "
            "orange particles. Lower third kept clean for title text. No text "
            "in the image. 1080x1920 portrait."
        )

    photo_bytes = pathlib.Path(photo_path).read_bytes()
    photo_mime = "image/png" if photo_path.lower().endswith(".png") else "image/jpeg"

    # Optional style reference — single brand background
    template_path = os.path.join(COVER_SYSTEM_DIR, "template-cover.png")
    parts = [types.Part.from_text(text=prompt), types.Part.from_bytes(data=photo_bytes, mime_type=photo_mime)]
    if os.path.exists(template_path):
        tpl_bytes = pathlib.Path(template_path).read_bytes()
        parts.append(types.Part.from_bytes(data=tpl_bytes, mime_type="image/png"))

    client = genai.Client(api_key=api_key)

    for model in (PRIMARY_MODEL, FALLBACK_MODEL):
        try:
            response = client.models.generate_content(
                model=model,
                contents=[types.Content(parts=parts)],
                config=types.GenerateContentConfig(response_modalities=["IMAGE", "TEXT"])
            )
            for part in (response.candidates[0].content.parts if response.candidates else []):
                if getattr(part, "inline_data", None):
                    with open(output_path, "wb") as f:
                        f.write(part.inline_data.data)
                    print(f"✓ Gemini ({model}) вернул обложку")
                    return True
            print(f"ПРЕДУПРЕЖДЕНИЕ: {model} не вернул изображение, пробую следующий.")
        except Exception as e:
            print(f"ПРЕДУПРЕЖДЕНИЕ: {model} ошибка: {e}")

    return False


def main():
    if len(sys.argv) < 2:
        print("Использование: python generate_bg.py <photo_path> [--title \"...\"]")
        sys.exit(1)

    photo_path = sys.argv[1]
    if not os.path.exists(photo_path):
        print(f"ОШИБКА: Файл не найден: {photo_path}")
        sys.exit(1)

    title = None
    if "--title" in sys.argv:
        i = sys.argv.index("--title")
        if i + 1 < len(sys.argv):
            title = sys.argv[i + 1]

    # Output путь вычисляем относительно переданного фото.
    # Если фото из cover_candidates/ → output на уровень выше (в output/).
    # Если фото из assets/photos/ → output рядом с photo_path НЕ создаём; идём в cwd.
    if "cover_candidates" in photo_path.replace("\\", "/"):
        output_dir = os.path.dirname(os.path.dirname(photo_path))
    else:
        output_dir = os.getcwd()

    output_path = os.path.join(output_dir, "cover_bg_generated.png")

    print(f"Генерирую фон обложки из: {photo_path}")
    if generate_with_gemini(photo_path, output_path, title=title):
        method = "gemini"
    else:
        shutil.copy2(photo_path, output_path)
        print(f"✓ Используем оригинал (без AI-редактирования): {output_path}")
        method = "fallback_original"

    with open(os.path.join(output_dir, "cover_method.txt"), "w", encoding="utf-8") as f:
        f.write(method)

    print(f"✓ Метод: {method}")
    print(f"✓ Файл: {output_path}")


if __name__ == "__main__":
    main()
