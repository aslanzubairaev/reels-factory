#!/usr/bin/env python3
"""
Генерация karaoke-style ASS-субтитров из words_raw.json.

Каждое произносимое слово подсвечивается оранжевым #FF6B00 в момент произнесения.
Остальные слова строки — белые. Активное слово меняется по words_raw.json таймингу.

Строка = 3-4 слова (короче → лучше читается на телефоне).
SRT генерится параллельно — простой формат без word-level, для ручной правки в CapCut.

Использует subtitle_placement.json для позиционирования (top / center / low).
"""

import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import os
import json
import re

# Цвета в ASS — порядок BGR + альфа перед
ASS_WHITE = "&H00FFFFFF"
ASS_ORANGE = "&H00006BFF"   # #FF6B00 в BGR
ASS_BLACK = "&H00000000"
ASS_SHADOW = "&H80000000"

# Шрифт (Montserrat ExtraBold знает кириллицу; Arial Black — fallback)
ASS_FONT_CYR = "Montserrat"
ASS_FONT_LAT = "Bebas Neue"

MAX_WORDS_PER_LINE = 4
# Если пауза между соседними словами больше этого — форсируем переход на новую «строку»
LINE_BREAK_GAP_SEC = 0.60


def format_ass_time(seconds):
    seconds = max(0.0, float(seconds))
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    if cs == 100:
        cs = 99
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def format_srt_time(seconds):
    seconds = max(0.0, float(seconds))
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    if ms == 1000:
        ms = 999
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def group_words_into_lines(words, max_words=MAX_WORDS_PER_LINE, gap=LINE_BREAK_GAP_SEC):
    """Группируем слова в строки: по max_words, либо при длинной паузе,
    либо после знаков препинания в конце слова."""
    lines = []
    cur = []
    for i, w in enumerate(words):
        cur.append(w)
        ends_phrase = bool(re.search(r"[.!?]$", w["word"]))
        long_gap = (i + 1 < len(words) and words[i + 1]["start"] - w["end"] >= gap)
        if len(cur) >= max_words or ends_phrase or long_gap:
            lines.append(cur)
            cur = []
    if cur:
        lines.append(cur)
    return lines


def has_cyrillic(text):
    return any("\u0400" <= ch <= "\u04FF" for ch in text)


def build_karaoke_events(lines):
    r"""Для каждой строки генерирует N событий — по одному на каждое активное слово.
    Активное слово оборачивается {\c<orange>}...{\c<white>}, остальные белые."""
    events = []
    for line_words in lines:
        if not line_words:
            continue

        # Границы времени строки: с первого до последнего слова.
        line_start = line_words[0]["start"]
        line_end = line_words[-1]["end"]

        # Для каждого слова создаём событие
        for i, active in enumerate(line_words):
            parts = []
            for j, w in enumerate(line_words):
                txt = w["word"]
                if j == i:
                    parts.append(f"{{\\c{ASS_ORANGE}}}{txt}{{\\c{ASS_WHITE}}}")
                else:
                    parts.append(txt)
            text = " ".join(parts)

            # start = момент начала произнесения активного слова
            # end = начало следующего слова ИЛИ конец строки
            start = active["start"] if i > 0 else line_start
            if i + 1 < len(line_words):
                end = line_words[i + 1]["start"]
            else:
                end = max(line_end, active["end"])

            events.append({"start": start, "end": end, "text": text})
    return events


def generate_ass(words, placement):
    zone = placement.get("zone") or {}
    font_size = int(zone.get("font_size") or 72)
    margin_l = int(zone.get("x") or 60)
    margin_r = 1080 - margin_l - int(zone.get("width") or 860)
    margin_v = max(40, 1920 - int(zone.get("y") or 1380) - int(zone.get("height") or 260))

    # Alignment: 2 = bottom center. Выбираем по position_name из analyze_frame.
    position_name = (zone.get("position_name") or "low").lower()
    alignment = {"top": 8, "center": 5, "low": 2}.get(position_name, 2)

    full_text = " ".join(w["word"] for w in words)
    font_name = ASS_FONT_CYR if has_cyrillic(full_text) else ASS_FONT_LAT

    # Style: Primary = белый (неактивные), Outline = чёрный, Shadow = мягкая.
    # BorderStyle=1 (outline + shadow), Bold=-1, Spacing=0, ScaleX=100, ScaleY=100.
    header = (
        "[Script Info]\n"
        "Title: Reels Factory Subtitles\n"
        "ScriptType: v4.00+\n"
        "PlayResX: 1080\n"
        "PlayResY: 1920\n"
        "WrapStyle: 2\n"
        "ScaledBorderAndShadow: yes\n"
        "YCbCr Matrix: TV.709\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Karaoke,{font_name},{font_size},{ASS_WHITE},{ASS_ORANGE},{ASS_BLACK},{ASS_SHADOW},"
        f"-1,0,0,0,100,100,0,0,1,5,2,{alignment},{margin_l},{margin_r},{margin_v},1\n\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )

    lines = group_words_into_lines(words)
    events = build_karaoke_events(lines)

    body = []
    for e in events:
        body.append(
            f"Dialogue: 0,{format_ass_time(e['start'])},{format_ass_time(e['end'])},"
            f"Karaoke,,0,0,0,,{e['text']}"
        )
    return header + "\n".join(body) + "\n"


def generate_srt(words):
    """SRT без word-level. Для импорта в CapCut/Premiere на случай ручной правки."""
    lines = group_words_into_lines(words)
    out = []
    for i, line_words in enumerate(lines, 1):
        if not line_words:
            continue
        start = line_words[0]["start"]
        end = line_words[-1]["end"]
        text = " ".join(w["word"] for w in line_words)
        out.append(f"{i}\n{format_srt_time(start)} --> {format_srt_time(end)}\n{text}\n")
    return "\n".join(out)


def main():
    if len(sys.argv) < 2:
        print("Использование: python generate_subs.py <output_dir>")
        sys.exit(1)

    output_dir = sys.argv[1]
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
        print(f"Субтитры отключены: {placement.get('reason', 'нет причины')}")
        print("Пропускаю генерацию субтитров.")
        return

    if not words:
        print("ОШИБКА: words_raw.json пуст.")
        sys.exit(1)

    ass_content = generate_ass(words, placement)
    ass_path = os.path.join(output_dir, "subtitles.ass")
    with open(ass_path, "w", encoding="utf-8") as f:
        f.write(ass_content)
    print(f"✓ ASS (karaoke): {ass_path}")

    srt_content = generate_srt(words)
    srt_path = os.path.join(output_dir, "transcript.srt")
    with open(srt_path, "w", encoding="utf-8") as f:
        f.write(srt_content)
    print(f"✓ SRT (fallback): {srt_path}")

    lines_count = len(group_words_into_lines(words))
    events_count = len(build_karaoke_events(group_words_into_lines(words)))
    zone = placement.get("zone") or {}
    print(f"\nСтрок: {lines_count}, karaoke-событий: {events_count}")
    print(f"Позиция: {zone.get('position_name', 'low')} ({zone.get('font_size', 72)}px)")


if __name__ == "__main__":
    main()
