#!/usr/bin/env python3
"""
Наложение текста на обложку Instagram Reels через Pillow.

Правила размещения:
- Текст в НИЖНЕЙ ТРЕТИ кадра (y ≈ 1400-1700), чтобы не перекрывать лицо автора.
- X-центр смещён влево (540→500), чтобы не конфликтовать с колонкой кнопок Reels.
- Safe zones Instagram соблюдаются: top 150px, right 162px (Y 750-1500), bottom 380px.
- Badge из cover_text.json ИГНОРИРУЕТСЯ — пользователь отказался от бейджа.

Шрифт:
- Кириллица → Montserrat ExtraBold (studio/templates/fonts/).
- Латиница → Bebas Neue (бренд).
- Fallback → Impact (системный).

Цвета:
- LINE1: белый #FFFFFF
- LINE2: оранжевый #FF6B00
- Плюс оранжевое подчёркивание под LINE2 (как в cover_example_text.png).

Обводка:
- Чёрная 5px, мягкая тень 8px — читаемо на любом фоне.
"""

import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import os
import json

W, H = 1080, 1920
CENTER_X = 500  # чуть левее геометрического центра (540) — safe zone справа 162px

# Позиции текста (нижняя треть, но выше нижней safe zone 380px)
LINE1_Y_CENTER = 1450   # главный текст
LINE2_Y_CENTER = 1560   # подзаголовок
UNDERLINE_Y = 1600      # оранжевая черта под подзаголовком

COLOR_WHITE = (255, 255, 255, 255)
COLOR_ORANGE = (255, 107, 0, 255)
COLOR_OUTLINE = (0, 0, 0, 255)
COLOR_SHADOW = (0, 0, 0, 170)


def _find_font(has_cyrillic, size):
    """Возвращает ImageFont, учитывая наличие кириллицы."""
    from PIL import ImageFont

    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    montserrat = os.path.join(project_root, "studio", "templates", "fonts", "Montserrat-ExtraBold.ttf")
    bebas = os.path.join(project_root, "studio", "templates", "fonts", "BebasNeue-Regular.ttf")

    # Для кириллицы — Montserrat ExtraBold (бандл в проекте), fallback Impact.
    # Для латиницы — Bebas Neue (brand), fallback Montserrat/Impact.
    if has_cyrillic:
        candidates = [montserrat, "C:/Windows/Fonts/impact.ttf", "C:/Windows/Fonts/arialbd.ttf",
                      "/System/Library/Fonts/Supplemental/Impact.ttf"]
    else:
        candidates = [bebas, montserrat, "C:/Windows/Fonts/impact.ttf"]

    for fp in candidates:
        if fp and os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size), fp
            except Exception:
                continue
    return ImageFont.load_default(), None


def _draw_text_with_effects(draw, text, font, xy, fill_color):
    """Рисует текст с мягкой тенью + чёрной обводкой + заливкой."""
    x, y = xy
    # Мягкая тень (offset вниз-вправо)
    for dx, dy in [(3, 5), (4, 6), (5, 7)]:
        draw.text((x + dx, y + dy), text, font=font, fill=COLOR_SHADOW)
    # Чёрная обводка (толщина 5)
    for dx in range(-5, 6):
        for dy in range(-5, 6):
            if dx * dx + dy * dy <= 25:
                draw.text((x + dx, y + dy), text, font=font, fill=COLOR_OUTLINE)
    # Основной цвет
    draw.text((x, y), text, font=font, fill=fill_color)


def overlay_text(bg_path, cover_text, output_dir):
    from PIL import Image, ImageDraw

    img = Image.open(bg_path).convert("RGBA")
    if img.size != (W, H):
        img = img.resize((W, H), Image.LANCZOS)

    txt_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(txt_layer)

    line1 = (cover_text.get("line1") or "").upper()
    line2 = (cover_text.get("line2") or "").upper()

    all_text = " ".join([line1, line2])
    has_cyrillic = any("а" <= ch.lower() <= "я" or ch.lower() == "ё" for ch in all_text)

    # Размеры шрифтов. Line1 крупнее — это главный заголовок.
    font_line1, font_path = _find_font(has_cyrillic, 105)
    font_line2, _ = _find_font(has_cyrillic, 70)
    if font_path:
        print(f"Шрифт: {os.path.basename(font_path)}")

    # Автосжатие line1, если не влезает в ~880px (1080 - отступы).
    MAX_TEXT_WIDTH = 880
    for size in (105, 95, 85, 78):
        font_line1, _ = _find_font(has_cyrillic, size)
        bbox = draw.textbbox((0, 0), line1, font=font_line1)
        if (bbox[2] - bbox[0]) <= MAX_TEXT_WIDTH:
            break

    # Line 1: белый, центр по горизонтали (относительно CENTER_X), y=LINE1_Y_CENTER
    if line1:
        bbox = draw.textbbox((0, 0), line1, font=font_line1)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        x = CENTER_X - tw // 2
        y = LINE1_Y_CENTER - th // 2
        _draw_text_with_effects(draw, line1, font_line1, (x, y), COLOR_WHITE)

    # Line 2: оранжевый. Автосжатие до 820px.
    if line2:
        for size in (70, 62, 54, 48):
            font_line2, _ = _find_font(has_cyrillic, size)
            bbox = draw.textbbox((0, 0), line2, font=font_line2)
            if (bbox[2] - bbox[0]) <= 820:
                break

        bbox = draw.textbbox((0, 0), line2, font=font_line2)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        x = CENTER_X - tw // 2
        y = LINE2_Y_CENTER - th // 2
        _draw_text_with_effects(draw, line2, font_line2, (x, y), COLOR_ORANGE)

        # Оранжевая подчёркивающая черта под line2 — акцент как в брендовом примере.
        underline_width = min(tw + 40, 700)
        ux = CENTER_X - underline_width // 2
        uy = UNDERLINE_Y
        draw.rectangle([ux, uy, ux + underline_width, uy + 6], fill=COLOR_ORANGE)

    # Композит и сохранение в lossless PNG.
    result = Image.alpha_composite(img, txt_layer).convert("RGB")

    final_path = os.path.join(output_dir, "cover_final.png")
    result.save(final_path, "PNG", compress_level=1)  # lossless, min compression
    print(f"✓ Обложка: {final_path} ({result.size[0]}x{result.size[1]})")

    preview = result.resize((540, 960), Image.LANCZOS)
    preview_path = os.path.join(output_dir, "cover_preview.png")
    preview.save(preview_path, "PNG", compress_level=3)
    print(f"✓ Preview: {preview_path}")

    return final_path, preview_path


def main():
    if len(sys.argv) < 3:
        print("Использование: python overlay_text.py <bg_path> <cover_text.json>")
        sys.exit(1)

    bg_path = sys.argv[1]
    text_path = sys.argv[2]

    if not os.path.exists(bg_path):
        print(f"ОШИБКА: Фон не найден: {bg_path}")
        sys.exit(1)
    if not os.path.exists(text_path):
        print(f"ОШИБКА: cover_text.json не найден: {text_path}")
        sys.exit(1)

    with open(text_path, "r", encoding="utf-8") as f:
        cover_text = json.load(f)

    output_dir = os.path.dirname(text_path)
    final_path, preview_path = overlay_text(bg_path, cover_text, output_dir)

    data = {
        "source_bg": os.path.basename(bg_path),
        "text": {
            "line1": cover_text.get("line1", ""),
            "line2": cover_text.get("line2", "")
        },
        "dimensions": {"width": W, "height": H},
        "files": {"final": "cover_final.png", "preview": "cover_preview.png"}
    }
    data_path = os.path.join(output_dir, "cover_data.json")
    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"✓ Метаданные: {data_path}")


if __name__ == "__main__":
    main()
