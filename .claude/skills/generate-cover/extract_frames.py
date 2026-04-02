#!/usr/bin/env python3
"""
Извлечение кадров из видео и оценка чёткости для выбора лучшего кадра обложки.
"""

import sys
import os
import json
import subprocess
import tempfile

def get_duration(video_path):
    """Получить длительность видео."""
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    info = json.loads(result.stdout)
    return float(info["format"]["duration"])

def extract_frame(video_path, time_sec, output_path):
    """Извлечь один кадр."""
    cmd = [
        "ffmpeg", "-y", "-ss", str(time_sec), "-i", video_path,
        "-vframes", "1", "-q:v", "1", output_path
    ]
    subprocess.run(cmd, capture_output=True)
    return os.path.exists(output_path)

def evaluate_sharpness(image_path):
    """Оценить чёткость кадра через Laplacian variance."""
    try:
        import cv2
        img = cv2.imread(image_path)
        if img is None:
            return 0.0
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        return cv2.Laplacian(gray, cv2.CV_64F).var()
    except ImportError:
        # Без OpenCV — возвращаем размер файла как приближение
        return os.path.getsize(image_path)

def main():
    if len(sys.argv) < 2:
        print("Использование: python extract_frames.py <video_path>")
        sys.exit(1)
    
    video_path = sys.argv[1]
    if not os.path.exists(video_path):
        print(f"ОШИБКА: Файл не найден: {video_path}")
        sys.exit(1)
    
    output_dir = os.path.dirname(video_path)
    candidates_dir = os.path.join(output_dir, "cover_candidates")
    os.makedirs(candidates_dir, exist_ok=True)
    
    duration = get_duration(video_path)
    num_frames = 8
    
    print(f"Извлекаю {num_frames} кадров из {duration:.1f} сек видео...")
    
    frames = []
    for i in range(num_frames):
        time_sec = (duration / (num_frames + 1)) * (i + 1)
        frame_path = os.path.join(candidates_dir, f"frame_{i:02d}.png")
        
        if extract_frame(video_path, time_sec, frame_path):
            sharpness = evaluate_sharpness(frame_path)
            frames.append({
                "path": frame_path,
                "filename": f"frame_{i:02d}.png",
                "time": round(time_sec, 2),
                "sharpness": round(sharpness, 2)
            })
            print(f"  frame_{i:02d}.png @ {time_sec:.1f}s — чёткость: {sharpness:.0f}")
    
    # Сортировка по чёткости
    frames.sort(key=lambda x: x["sharpness"], reverse=True)
    
    # Топ-3
    top3 = frames[:3]
    
    # Сохранить метаданные
    meta = {
        "all_frames": frames,
        "top3": [f["filename"] for f in top3],
        "video_duration": round(duration, 2)
    }
    meta_path = os.path.join(candidates_dir, "frames_meta.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    
    print(f"\n✓ Топ-3 кадра:")
    for i, f in enumerate(top3, 1):
        print(f"  {i}. {f['filename']} (чёткость: {f['sharpness']:.0f}, время: {f['time']:.1f}s)")
    print(f"\nКадры сохранены в: {candidates_dir}")

if __name__ == "__main__":
    main()
