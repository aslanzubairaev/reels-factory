#!/usr/bin/env python3
"""
Анализ кадров видео для определения безопасной зоны субтитров.
Создаёт subtitle_placement.json с координатами размещения.
"""

import sys
import os
import json
import subprocess
import tempfile

def extract_frames(video_path, output_dir, count=6):
    """Извлечь равномерно распределённые кадры из видео."""
    # Получить длительность
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    info = json.loads(result.stdout)
    duration = float(info["format"]["duration"])
    
    frames = []
    for i in range(count):
        time = (duration / (count + 1)) * (i + 1)
        frame_path = os.path.join(output_dir, f"frame_{i:02d}.png")
        cmd = [
            "ffmpeg", "-y", "-ss", str(time), "-i", video_path,
            "-vframes", "1", "-q:v", "2", frame_path
        ]
        subprocess.run(cmd, capture_output=True)
        if os.path.exists(frame_path):
            frames.append(frame_path)
    
    return frames

def analyze_frames(frame_paths):
    """Анализ кадров для определения зон с контентом."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        print("ПРЕДУПРЕЖДЕНИЕ: opencv-python не установлен. Используем позицию по умолчанию.")
        return None
    
    camera_regions = []
    content_regions = []
    
    for frame_path in frame_paths:
        img = cv2.imread(frame_path)
        if img is None:
            continue
        
        h, w = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Face detection (камера)
        face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        )
        faces = face_cascade.detectMultiScale(gray, 1.3, 5)
        for (x, y, fw, fh) in faces:
            # Расширяем зону камеры (лицо + рамка)
            margin = int(max(fw, fh) * 0.5)
            camera_regions.append({
                "x": max(0, x - margin),
                "y": max(0, y - margin),
                "w": fw + margin * 2,
                "h": fh + margin * 2
            })
        
        # Edge detection для контента (текст, графика)
        edges = cv2.Canny(gray, 50, 150)
        # Анализ по горизонтальным полосам
        strip_height = h // 10
        for i in range(10):
            y_start = i * strip_height
            y_end = (i + 1) * strip_height
            strip = edges[y_start:y_end, :]
            edge_density = np.mean(strip) / 255.0
            if edge_density > 0.1:  # Много контента в этой полосе
                content_regions.append({
                    "y_start": y_start,
                    "y_end": y_end,
                    "density": round(edge_density, 3)
                })
    
    return {
        "camera_regions": camera_regions,
        "content_regions": content_regions
    }

def find_safe_zone(analysis, width=1080, height=1920):
    """Найти безопасную зону для субтитров."""
    # Instagram safe zones
    SAFE_TOP = 150
    SAFE_BOTTOM = 1700
    SAFE_RIGHT_BUTTONS_X = 920
    SAFE_RIGHT_BUTTONS_Y_START = 750
    SAFE_RIGHT_BUTTONS_Y_END = 1500
    
    # Зона по умолчанию: нижняя треть (но выше safe zone)
    default_zone = {
        "x": 60,
        "y": 1350,
        "width": 860,  # 1080 - 60 (left) - 160 (right buttons)
        "height": 300,
        "alignment": "center",
        "font_size": 68
    }
    
    if analysis is None:
        return True, default_zone, "OpenCV недоступен, используем позицию по умолчанию"
    
    # Проверить есть ли камера в зоне субтитров
    for cam in analysis.get("camera_regions", []):
        cam_bottom = cam["y"] + cam["h"]
        if cam["y"] < default_zone["y"] + default_zone["height"] and cam_bottom > default_zone["y"]:
            # Камера перекрывает зону субтитров — попробуем выше
            new_y = cam["y"] - 350
            if new_y > SAFE_TOP + 100:
                default_zone["y"] = new_y
                return True, default_zone, f"Камера внизу, субтитры сдвинуты выше (y={new_y})"
            
            # Попробуем уменьшить шрифт
            default_zone["font_size"] = 48
            default_zone["height"] = 200
            new_y = cam["y"] - 250
            if new_y > SAFE_TOP + 100:
                default_zone["y"] = new_y
                return True, default_zone, f"Камера внизу, субтитры уменьшены и сдвинуты (y={new_y}, size=48)"
            
            # Не получается — отключаем субтитры
            return False, default_zone, "Камера занимает слишком много места, субтитры испортят видео"
    
    return True, default_zone, "Стандартная позиция, конфликтов нет"

def main():
    if len(sys.argv) < 2:
        print("Использование: python analyze_frame.py <путь_к_видео>")
        sys.exit(1)
    
    video_path = sys.argv[1]
    if not os.path.exists(video_path):
        print(f"ОШИБКА: Файл не найден: {video_path}")
        sys.exit(1)
    
    output_dir = os.path.dirname(video_path)
    
    # Извлечь кадры во временную папку
    with tempfile.TemporaryDirectory() as tmp_dir:
        print("Извлекаю кадры для анализа...")
        frames = extract_frames(video_path, tmp_dir, count=6)
        print(f"Извлечено {len(frames)} кадров")
        
        print("Анализирую кадры...")
        analysis = analyze_frames(frames)
    
    # Найти безопасную зону
    enabled, zone, reason = find_safe_zone(analysis)
    
    # Сохранить результат
    placement = {
        "subtitles_enabled": enabled,
        "reason": reason,
        "zone": zone,
        "instagram_safe_zones": {
            "top": 150,
            "bottom_start": 1700,
            "right_buttons_x": 920,
            "right_buttons_y_range": [750, 1500]
        }
    }
    
    if analysis:
        placement["analysis"] = {
            "camera_regions_found": len(analysis.get("camera_regions", [])),
            "content_strips_active": len(analysis.get("content_regions", []))
        }
    
    placement_path = os.path.join(output_dir, "subtitle_placement.json")
    with open(placement_path, "w", encoding="utf-8") as f:
        json.dump(placement, f, ensure_ascii=False, indent=2)
    
    status = "✓ ВКЛЮЧЕНЫ" if enabled else "✗ ОТКЛЮЧЕНЫ"
    print(f"\nСубтитры: {status}")
    print(f"Причина: {reason}")
    if enabled:
        print(f"Позиция: x={zone['x']}, y={zone['y']}, размер шрифта={zone['font_size']}")
    print(f"Сохранено: {placement_path}")

if __name__ == "__main__":
    main()
