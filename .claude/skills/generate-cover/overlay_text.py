#!/usr/bin/env python3
"""
Наложение текста на обложку через Pillow.
Создаёт cover_final.png (1080x1920) и cover_preview.png (540x960).
"""

import sys
import os
import json

def overlay_text(bg_path, cover_text, output_dir):
    """Наложить текст на фон."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("ОШИБКА: Pillow не установлен.")
        print("Установите: pip install Pillow")
        sys.exit(1)
    
    # Открыть фон
    img = Image.open(bg_path).convert("RGBA")
    
    # Ресайз до 1080x1920 если нужно
    if img.size != (1080, 1920):
        img = img.resize((1080, 1920), Image.LANCZOS)
    
    # Создать слой для текста
    txt_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(txt_layer)
    
    # Шрифты
    font_paths = [
        "C:/Windows/Fonts/impact.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/Impact.ttf",
        "/System/Library/Fonts/Supplemental/Impact.ttf",
    ]
    
    font_large = None
    font_medium = None
    font_small = None
    
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                font_large = ImageFont.truetype(fp, 95)
                font_medium = ImageFont.truetype(fp, 60)
                font_small = ImageFont.truetype(fp, 36)
                break
            except Exception:
                continue
    
    if font_large is None:
        print("ПРЕДУПРЕЖДЕНИЕ: Шрифт не найден, используем встроенный")
        font_large = ImageFont.load_default()
        font_medium = font_large
        font_small = font_large
    
    line1 = cover_text.get("line1", "").upper()
    line2 = cover_text.get("line2", "")
    badge = cover_text.get("badge", "")
    
    # Позиция текста: центр на ~65% высоты
    center_y = int(1920 * 0.65)
    center_x = 540  # Сдвинуто чуть левее от центра (safe zone справа)
    
    # Рисуем line1 (основной текст — белый с чёрной обводкой)
    if line1:
        bbox = draw.textbbox((0, 0), line1, font=font_large)
        tw = bbox[2] - bbox[0]
        x = center_x - tw // 2
        y = center_y - 80
        
        # Обводка (рисуем текст со смещением)
        outline_color = (0, 0, 0, 255)
        for dx in range(-4, 5):
            for dy in range(-4, 5):
                if dx*dx + dy*dy <= 16:
                    draw.text((x + dx, y + dy), line1, font=font_large, fill=outline_color)
        
        # Основной текст — белый
        draw.text((x, y), line1, font=font_large, fill=(255, 255, 255, 255))
    
    # Рисуем line2 (подзаголовок — оранжевый)
    if line2:
        bbox = draw.textbbox((0, 0), line2, font=font_medium)
        tw = bbox[2] - bbox[0]
        x = center_x - tw // 2
        y = center_y + 40
        
        # Обводка
        for dx in range(-3, 4):
            for dy in range(-3, 4):
                if dx*dx + dy*dy <= 9:
                    draw.text((x + dx, y + dy), line2, font=font_medium, fill=(0, 0, 0, 255))
        
        # Текст — оранжевый #FF6B00
        draw.text((x, y), line2, font=font_medium, fill=(255, 107, 0, 255))
    
    # Рисуем badge (маленький бейдж в верхнем правом углу)
    if badge:
        badge_text = f" {badge} "
        bbox = draw.textbbox((0, 0), badge_text, font=font_small)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        
        bx = 1080 - tw - 180  # Отступ от правого края (safe zone)
        by = 200
        
        # Фон бейджа
        draw.rounded_rectangle(
            [bx - 10, by - 5, bx + tw + 10, by + th + 10],
            radius=8,
            fill=(255, 107, 0, 230)
        )
        draw.text((bx, by), badge_text, font=font_small, fill=(255, 255, 255, 255))
    
    # Объединить слои
    result = Image.alpha_composite(img, txt_layer)
    result = result.convert("RGB")
    
    # Сохранить cover_final.png
    final_path = os.path.join(output_dir, "cover_final.png")
    result.save(final_path, "PNG", quality=95)
    print(f"✓ Обложка: {final_path}")
    
    # Сохранить cover_preview.png (540x960)
    preview = result.resize((540, 960), Image.LANCZOS)
    preview_path = os.path.join(output_dir, "cover_preview.png")
    preview.save(preview_path, "PNG", quality=85)
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
    
    # Сохранить cover_data.json
    data = {
        "source_bg": os.path.basename(bg_path),
        "text": {
            "line1": cover_text.get("line1", ""),
            "line2": cover_text.get("line2", ""),
            "badge": cover_text.get("badge", "")
        },
        "dimensions": {"width": 1080, "height": 1920},
        "files": {
            "final": "cover_final.png",
            "preview": "cover_preview.png"
        }
    }
    
    data_path = os.path.join(output_dir, "cover_data.json")
    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"✓ Метаданные: {data_path}")

if __name__ == "__main__":
    main()
