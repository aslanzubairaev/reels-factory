#!/usr/bin/env python3
"""
Генерация субтитров ASS + SRT из words_raw.json и subtitle_placement.json.
"""

import sys
import os
import json

def format_ass_time(seconds):
    """Формат времени для ASS: H:MM:SS.CC"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int((seconds % 1) * 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

def format_srt_time(seconds):
    """Формат времени для SRT: HH:MM:SS,MMM"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

def group_words_into_lines(words, max_words=7):
    """Группировка слов в строки по 6-8 слов."""
    lines = []
    current_line = []
    
    for word in words:
        current_line.append(word)
        if len(current_line) >= max_words:
            lines.append(current_line)
            current_line = []
    
    if current_line:
        lines.append(current_line)
    
    return lines

def generate_ass(words, placement):
    """Генерация ASS файла."""
    zone = placement["zone"]
    font_size = zone.get("font_size", 68)
    margin_l = zone.get("x", 60)
    margin_r = 1080 - zone.get("x", 60) - zone.get("width", 860)
    margin_v = 1920 - zone.get("y", 1350) - zone.get("height", 300)
    
    # ASS header
    ass = f"""[Script Info]
Title: Reels Factory Subtitles
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial Black,{font_size},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,0,2,{margin_l},{margin_r},{margin_v},1
Style: Highlight,Arial Black,{font_size},&H000066FF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,0,2,{margin_l},{margin_r},{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    
    # Группируем слова в строки
    lines = group_words_into_lines(words)
    
    for line_words in lines:
        if not line_words:
            continue
        start = line_words[0]["start"]
        end = line_words[-1]["end"]
        text = " ".join(w["word"] for w in line_words)
        
        start_str = format_ass_time(start)
        end_str = format_ass_time(end)
        
        ass += f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{text}\n"
    
    return ass

def generate_srt(words):
    """Генерация SRT файла."""
    lines = group_words_into_lines(words)
    srt = ""
    
    for i, line_words in enumerate(lines, 1):
        if not line_words:
            continue
        start = line_words[0]["start"]
        end = line_words[-1]["end"]
        text = " ".join(w["word"] for w in line_words)
        
        srt += f"{i}\n"
        srt += f"{format_srt_time(start)} --> {format_srt_time(end)}\n"
        srt += f"{text}\n\n"
    
    return srt

def main():
    if len(sys.argv) < 2:
        print("Использование: python generate_subs.py <output_dir>")
        sys.exit(1)
    
    output_dir = sys.argv[1]
    
    # Читаем входные файлы
    words_path = os.path.join(output_dir, "words_raw.json")
    placement_path = os.path.join(output_dir, "subtitle_placement.json")
    
    if not os.path.exists(words_path):
        print(f"ОШИБКА: Файл не найден: {words_path}")
        sys.exit(1)
    
    if not os.path.exists(placement_path):
        print(f"ОШИБКА: Файл не найден: {placement_path}")
        print("Сначала запустите analyze_frame.py")
        sys.exit(1)
    
    with open(words_path, "r", encoding="utf-8") as f:
        words = json.load(f)
    
    with open(placement_path, "r", encoding="utf-8") as f:
        placement = json.load(f)
    
    if not placement.get("subtitles_enabled", True):
        print(f"Субтитры отключены: {placement.get('reason', 'неизвестная причина')}")
        print("Пропускаю генерацию субтитров.")
        return
    
    if not words:
        print("ОШИБКА: words_raw.json пуст.")
        sys.exit(1)
    
    # Генерация ASS
    ass_content = generate_ass(words, placement)
    ass_path = os.path.join(output_dir, "subtitles.ass")
    with open(ass_path, "w", encoding="utf-8") as f:
        f.write(ass_content)
    print(f"✓ ASS субтитры: {ass_path}")
    
    # Генерация SRT
    srt_content = generate_srt(words)
    srt_path = os.path.join(output_dir, "transcript.srt")
    with open(srt_path, "w", encoding="utf-8") as f:
        f.write(srt_content)
    print(f"✓ SRT субтитры: {srt_path}")
    
    lines_count = len(group_words_into_lines(words))
    print(f"\nВсего строк субтитров: {lines_count}")
    print(f"Шрифт: {placement['zone'].get('font_size', 68)}px")

if __name__ == "__main__":
    main()
