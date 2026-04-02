#!/usr/bin/env python3
"""
Транскрипция видео через OpenAI Whisper.
Создает: transcript_raw.txt, transcript.json, words_raw.json
"""

import sys
import os
import json

def main():
    if len(sys.argv) < 2:
        print("Использование: python transcribe.py <путь_к_видео>")
        print("Пример: python transcribe.py projects/my-reel/output/recording_full.mp4")
        sys.exit(1)

    video_path = sys.argv[1]

    if not os.path.exists(video_path):
        print(f"ОШИБКА: Файл не найден: {video_path}")
        sys.exit(1)

    file_size = os.path.getsize(video_path)
    if file_size < 1024:
        print(f"ОШИБКА: Файл слишком маленький ({file_size} байт). Возможно, файл пустой или повреждён.")
        sys.exit(1)

    output_dir = os.path.dirname(video_path)

    # Импорт whisper (после проверок, чтобы дать понятную ошибку)
    try:
        import whisper
    except ImportError:
        print("ОШИБКА: Whisper не установлен.")
        print("Установите: pip install openai-whisper")
        print("Также нужен FFmpeg в PATH.")
        sys.exit(1)

    print(f"Загрузка модели Whisper (medium)...")
    model = whisper.load_model("medium")

    print(f"Транскрибирую: {video_path}")
    print("Это может занять несколько минут...")

    # Транскрипция с пословными таймкодами
    result = model.transcribe(
        video_path,
        language="ru",
        word_timestamps=True,
        verbose=False
    )

    # 1. transcript_raw.txt — сырой текст
    raw_text = result["text"].strip()
    raw_path = os.path.join(output_dir, "transcript_raw.txt")
    with open(raw_path, "w", encoding="utf-8") as f:
        f.write(raw_text)
    print(f"✓ Сырой текст: {raw_path}")

    # 2. transcript.json — сегменты с таймкодами
    segments = []
    for seg in result["segments"]:
        segments.append({
            "start": round(seg["start"], 3),
            "end": round(seg["end"], 3),
            "text": seg["text"].strip()
        })

    segments_path = os.path.join(output_dir, "transcript.json")
    with open(segments_path, "w", encoding="utf-8") as f:
        json.dump(segments, f, ensure_ascii=False, indent=2)
    print(f"✓ Сегменты: {segments_path} ({len(segments)} шт.)")

    # 3. words_raw.json — пословные таймкоды
    words = []
    for seg in result["segments"]:
        if "words" in seg:
            for w in seg["words"]:
                words.append({
                    "word": w["word"].strip(),
                    "start": round(w["start"], 3),
                    "end": round(w["end"], 3)
                })

    words_path = os.path.join(output_dir, "words_raw.json")
    with open(words_path, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False, indent=2)
    print(f"✓ Слова: {words_path} ({len(words)} шт.)")

    # Итого
    duration = result["segments"][-1]["end"] if result["segments"] else 0
    word_count = len(raw_text.split())
    print(f"\n--- Итого ---")
    print(f"Длительность: {duration:.1f} сек")
    print(f"Сегментов: {len(segments)}")
    print(f"Слов: {word_count}")
    print(f"Слов с таймкодами: {len(words)}")

if __name__ == "__main__":
    main()
