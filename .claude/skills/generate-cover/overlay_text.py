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

Типографика:
- Тонкая чёрная обводка 3px — читаемо на любом фоне без «перегруза».
- Мягкая тень с плавным затуханием — глубина без контрастных чёрных краёв.
- БЕЗ подчёркивания — пользователю не нравилось, чище без него.
- Лёгкий letter-spacing (+6px) — типографически воздушнее.
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
LINE1_Y_CENTER = 1440   # главный текст
LINE2_Y_CENTER = 1580   # подзаголовок — больше gap для воздуха (140 vs прежних 110)

LETTER_SPACING = 6  # дополнительный tracking между буквами

COLOR_WHITE = (255, 255, 255, 255)
COLOR_ORANGE = (255, 107, 0, 255)
COLOR_OUTLINE = (0, 0, 0, 255)
COLOR_SHADOW = (0, 0, 0, 140)


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


def _measure_text_tracked(draw, text, font, tracking):
    """Ширина строки с учётом letter-spacing (tracking между буквами)."""
    if not text:
        return 0, 0
    total_w = 0
    max_h = 0
    for i, ch in enumerate(text):
        bbox = draw.textbbox((0, 0), ch, font=font)
        cw = bbox[2] - bbox[0]
        ch_h = bbox[3] - bbox[1]
        total_w += cw
        if i < len(text) - 1:
            total_w += tracking
        if ch_h > max_h:
            max_h = ch_h
    return total_w, max_h


def _draw_text_tracked(draw, text, font, xy, fill_color, tracking=LETTER_SPACING):
    """
    Рисует текст с lettering:
      - мягкая «blur-like» тень (несколько слоёв затухающих копий)
      - тонкая чёрная обводка 3px (контраст без перегруза)
      - letter-spacing между буквами — типографически чище
    """
    x, y = xy
    cursor = x
    for ch in text:
        bbox = draw.textbbox((0, 0), ch, font=font)
        cw = bbox[2] - bbox[0]

        # Многослойная мягкая тень — плавное затухание вместо жёсткого блока
        for (dx, dy, alpha) in [(2, 3, 140), (4, 6, 100), (6, 9, 60), (8, 12, 30)]:
            draw.text((cursor + dx, y + dy), ch, font=font, fill=(0, 0, 0, alpha))

        # Тонкая чёрная обводка — ровно по окружности радиуса 3
        for dx in range(-3, 4):
            for dy in range(-3, 4):
                if dx * dx + dy * dy <= 9 and (dx or dy):
                    draw.text((cursor + dx, y + dy), ch, font=font, fill=COLOR_OUTLINE)

        # Основной цвет
        draw.text((cursor, y), ch, font=font, fill=fill_color)

        cursor += cw + tracking


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

    font_line1, font_path = _find_font(has_cyrillic, 98)
    font_line2, _ = _find_font(has_cyrillic, 78)
    if font_path:
        print(f"Шрифт: {os.path.basename(font_path)}")

    # Автосжатие line1 с учётом letter-spacing, до ~880px.
    MAX_TEXT_WIDTH = 880
    for size in (98, 90, 82, 74, 66):
        font_line1, _ = _find_font(has_cyrillic, size)
        w1, _ = _measure_text_tracked(draw, line1, font_line1, LETTER_SPACING)
        if w1 <= MAX_TEXT_WIDTH:
            break

    # Line 1: белый
    if line1:
        tw, th = _measure_text_tracked(draw, line1, font_line1, LETTER_SPACING)
        x = CENTER_X - tw // 2
        y = LINE1_Y_CENTER - th // 2
        _draw_text_tracked(draw, line1, font_line1, (x, y), COLOR_WHITE)

    # Line 2: оранжевый. Автосжатие до 820px.
    if line2:
        for size in (78, 70, 62, 54):
            font_line2, _ = _find_font(has_cyrillic, size)
            w2, _ = _measure_text_tracked(draw, line2, font_line2, LETTER_SPACING)
            if w2 <= 820:
                break

        tw, th = _measure_text_tracked(draw, line2, font_line2, LETTER_SPACING)
        x = CENTER_X - tw // 2
        y = LINE2_Y_CENTER - th // 2
        _draw_text_tracked(draw, line2, font_line2, (x, y), COLOR_ORANGE)

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
