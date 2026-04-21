#!/usr/bin/env python3
"""
Анализ кадров видео → выбрать самую чистую безопасную зону для субтитров.

Логика:
  1. Извлекаем 6 кадров, равномерно распределённых по времени.
  2. Для каждого кадра ищем лицо (face detection) и считаем плотность
     «края»-контента (edges) — показатель насыщенности графикой/текстом.
  3. Проверяем 3 кандидат-зоны субтитров: верх, центр, низ (все — в пределах
     Instagram safe zones).
  4. Для каждой зоны считаем средний score (edges + пересечение с лицом).
  5. Выбираем зону с МИНИМАЛЬНЫМ score и ниже порога.
  6. Если все зоны слишком "грязные" — subtitles_enabled = False.

Философия: лучше без субтитров, чем субтитры поверх важного контента.
"""

import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import os
import json
import subprocess
import tempfile


# === Instagram safe zones ===
IG_SAFE_TOP = 150         # Верх 0-150 — шапка приложения
IG_SAFE_BOTTOM = 1700     # Низ 1700-1920 — описание + аудио
IG_RIGHT_MIN_X = 920      # Правая зона кнопок
IG_RIGHT_ZONE_Y = (750, 1500)


# === Candidate zones (в пределах safe zones) ===
# Каждая зона: y_center, height, font_size
CANDIDATE_ZONES = [
    # TOP — сразу под шапкой Instagram
    {"name": "top",    "y": 200,  "height": 260, "font_size": 68},
    # CENTER — середина экрана, между лицом (если вверху) и нижним интерфейсом
    {"name": "center", "y": 900,  "height": 260, "font_size": 68},
    # LOW-MID — чуть ниже центра, над зоной описания
    {"name": "low",    "y": 1380, "height": 260, "font_size": 68},
]

# Пороги. Если лучший score > EDGE_THRESHOLD — отказываемся от субтитров.
EDGE_THRESHOLD = 0.09
FACE_OVERLAP_PENALTY = 1.5  # коэффициент штрафа за пересечение с лицом


def extract_frames(video_path, output_dir, count=6):
    cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", video_path]
    info = json.loads(subprocess.run(cmd, capture_output=True, text=True).stdout)
    duration = float(info["format"]["duration"])

    frames = []
    for i in range(count):
        t = (duration / (count + 1)) * (i + 1)
        p = os.path.join(output_dir, f"frame_{i:02d}.png")
        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(t), "-i", video_path, "-vframes", "1", "-q:v", "2", p],
            capture_output=True
        )
        if os.path.exists(p):
            frames.append(p)
    return frames


def analyze_frame(img_path):
    """Вернёт {faces: [{x,y,w,h}], edge_map: np.array(h,w), h, w}."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        return None

    img = cv2.imread(img_path)
    if img is None:
        return None

    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    detected = face_cascade.detectMultiScale(gray, 1.3, 5)
    faces = []
    for (x, y, fw, fh) in detected:
        m = int(max(fw, fh) * 0.5)
        faces.append({
            "x": int(max(0, x - m)),
            "y": int(max(0, y - m)),
            "w": int(fw + m * 2),
            "h": int(fh + m * 2)
        })

    edges = cv2.Canny(gray, 50, 150)
    return {"faces": faces, "edges": edges, "h": h, "w": w}


def zone_score(zone, frame_analyses, target_w=1080, target_h=1920):
    """Средний показатель загрязнённости зоны по всем кадрам. Меньше = чище."""
    try:
        import numpy as np
    except ImportError:
        return 0.0

    # Convert candidate zone (target coords) to fractional, potem вернуть обратно
    y_frac_top = (zone["y"] - zone["height"] // 2) / target_h
    y_frac_bot = (zone["y"] + zone["height"] // 2) / target_h

    scores = []
    for a in frame_analyses:
        if not a:
            continue
        h, w = a["h"], a["w"]
        y_top = int(max(0, y_frac_top * h))
        y_bot = int(min(h, y_frac_bot * h))
        if y_bot <= y_top:
            continue

        strip = a["edges"][y_top:y_bot, :]
        edge_density = float(np.mean(strip)) / 255.0

        # Штраф за пересечение с лицом (в target-координатах)
        face_penalty = 0.0
        for f in a["faces"]:
            fy_frac_top = f["y"] / h
            fy_frac_bot = (f["y"] + f["h"]) / h
            if fy_frac_top < y_frac_bot and fy_frac_bot > y_frac_top:
                face_penalty = FACE_OVERLAP_PENALTY
                break

        scores.append(edge_density + face_penalty)

    return float(sum(scores) / len(scores)) if scores else 1.0


def pick_zone(frame_analyses, target_w=1080, target_h=1920):
    """Выбирает лучшую зону или возвращает None если все слишком грязные."""
    scored = []
    for z in CANDIDATE_ZONES:
        s = zone_score(z, frame_analyses, target_w, target_h)
        scored.append((s, z))
        print(f"  [{z['name']}] score={s:.3f}")

    scored.sort(key=lambda x: x[0])
    best_score, best = scored[0]

    if best_score > EDGE_THRESHOLD:
        return None, best, best_score  # слишком грязно — откажемся
    return best, best, best_score


def main():
    if len(sys.argv) < 2:
        print("Usage: analyze_frame.py <video>")
        sys.exit(1)

    video_path = sys.argv[1]
    if not os.path.exists(video_path):
        print(f"ERROR: Video not found: {video_path}")
        sys.exit(1)

    output_dir = os.path.dirname(video_path) or "."

    with tempfile.TemporaryDirectory() as tmp:
        print("Извлекаю кадры...")
        frames = extract_frames(video_path, tmp, count=6)
        print(f"Извлечено {len(frames)} кадров")

        print("Анализирую кадры (лицо + edge density)...")
        frame_analyses = [analyze_frame(f) for f in frames]
        frame_analyses = [a for a in frame_analyses if a]

    if not frame_analyses:
        print("ПРЕДУПРЕЖДЕНИЕ: OpenCV недоступен или кадры не прочитались.")
        # Без анализа — безопасный дефолт: низ экрана
        placement = {
            "subtitles_enabled": True,
            "reason": "OpenCV недоступен, используем позицию по умолчанию",
            "zone": {
                "x": 60, "y": 1380, "width": 860, "height": 260,
                "alignment": "center", "font_size": 68, "position_name": "low"
            }
        }
    else:
        print("Проверяю кандидат-зоны:")
        best, fallback, score = pick_zone(frame_analyses)
        if best is None:
            placement = {
                "subtitles_enabled": False,
                "reason": (
                    f"Все зоны слишком загружены (best={fallback['name']}, score={score:.3f} "
                    f"> порог {EDGE_THRESHOLD}). Субтитры испортят визуал — пропускаем."
                ),
                "zone": None
            }
        else:
            placement = {
                "subtitles_enabled": True,
                "reason": f"Зона «{best['name']}» самая чистая (score={score:.3f})",
                "zone": {
                    "x": 60,
                    "y": int(best["y"] - best["height"] // 2),
                    "width": 860,
                    "height": best["height"],
                    "alignment": "center",
                    "font_size": best["font_size"],
                    "position_name": best["name"]
                }
            }

    placement["instagram_safe_zones"] = {
        "top": IG_SAFE_TOP,
        "bottom_start": IG_SAFE_BOTTOM,
        "right_buttons_x": IG_RIGHT_MIN_X,
        "right_buttons_y_range": list(IG_RIGHT_ZONE_Y)
    }

    out = os.path.join(output_dir, "subtitle_placement.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(placement, f, ensure_ascii=False, indent=2)

    status = "ВКЛЮЧЕНЫ" if placement["subtitles_enabled"] else "ОТКЛЮЧЕНЫ"
    print(f"\nСубтитры: {status}")
    print(f"Причина: {placement['reason']}")
    if placement["subtitles_enabled"]:
        z = placement["zone"]
        print(f"Позиция: {z['position_name']} (y={z['y']}, font={z['font_size']})")
    print(f"Сохранено: {out}")


if __name__ == "__main__":
    main()
