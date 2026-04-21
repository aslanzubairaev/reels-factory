#!/usr/bin/env python3
"""
Вшивание субтитров + цветокоррекция в видео через FFmpeg.
Создаёт final_video_subs.mp4.
"""


import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import os
import subprocess

def render_with_subs(video_path, ass_path, output_path):
    """Рендеринг видео с субтитрами и цветокоррекцией."""
    # Нормализуем путь к ASS для FFmpeg (Windows: экранируем обратные слэши и двоеточия)
    ass_escaped = ass_path.replace("\\", "/").replace(":", "\\:")

    # Указываем FFmpeg, где искать шрифты для ASS (Montserrat, Bebas Neue).
    fonts_dir = os.path.abspath(os.path.join(
        os.path.dirname(__file__), "..", "..", "..", "studio", "templates", "fonts"
    ))
    fonts_escaped = fonts_dir.replace("\\", "/").replace(":", "\\:")

    # Фильтры
    filters = [
        # Субтитры
        f"ass='{ass_escaped}':fontsdir='{fonts_escaped}'",
        # Цветокоррекция: Teal & Orange look
        "eq=contrast=1.08:brightness=-0.02:saturation=0.82",
        # Виньетка
        "vignette=angle=PI/5:mode=backward"
    ]
    
    filter_str = ",".join(filters)
    
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-vf", filter_str,
        "-c:v", "libx264",
        "-crf", "16",
        "-preset", "slow",
        "-profile:v", "high",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        output_path
    ]
    
    print(f"Запускаю рендеринг...")
    print(f"Команда: {' '.join(cmd)}")
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"ОШИБКА FFmpeg: {result.stderr[-500:]}")
        return False
    
    return True

def render_without_subs(video_path, output_path):
    """Рендеринг видео только с цветокоррекцией (без субтитров)."""
    filters = [
        "eq=contrast=1.08:brightness=-0.02:saturation=0.82",
        "vignette=angle=PI/5:mode=backward"
    ]
    
    filter_str = ",".join(filters)
    
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-vf", filter_str,
        "-c:v", "libx264",
        "-crf", "16",
        "-preset", "slow",
        "-profile:v", "high",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        output_path
    ]
    
    print(f"Запускаю рендеринг (без субтитров, только цветокоррекция)...")
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"ОШИБКА FFmpeg: {result.stderr[-500:]}")
        return False
    
    return True

def main():
    if len(sys.argv) < 2:
        print("Использование:")
        print("  С субтитрами:  python render_video.py <video_path> <ass_path>")
        print("  Без субтитров: python render_video.py <video_path> --no-subs")
        sys.exit(1)
    
    video_path = sys.argv[1]
    no_subs = "--no-subs" in sys.argv
    ass_path = None if no_subs else (sys.argv[2] if len(sys.argv) > 2 else None)
    
    if not os.path.exists(video_path):
        print(f"ОШИБКА: Видео не найдено: {video_path}")
        sys.exit(1)
    
    if not no_subs and (not ass_path or not os.path.exists(ass_path)):
        print(f"ОШИБКА: ASS файл не найден: {ass_path}")
        sys.exit(1)
    
    output_dir = os.path.dirname(video_path)
    output_path = os.path.join(output_dir, "final_video_subs.mp4")

    # Если input == output (повторный прогон), пишем во временный файл и переименовываем.
    same_file = os.path.abspath(video_path) == os.path.abspath(output_path)
    target_path = output_path + ".tmp.mp4" if same_file else output_path

    if no_subs:
        success = render_without_subs(video_path, target_path)
    else:
        success = render_with_subs(video_path, ass_path, target_path)

    if success and same_file:
        try:
            os.replace(target_path, output_path)
        except OSError as e:
            print(f"ОШИБКА: не удалось заменить файл: {e}")
            success = False
    
    if success:
        size_mb = os.path.getsize(output_path) / (1024 * 1024)
        print(f"\n✓ Готово: {output_path}")
        print(f"  Размер: {size_mb:.1f} МБ")
    else:
        print("\n✗ Рендеринг не удался")
        sys.exit(1)

if __name__ == "__main__":
    main()
