#!/usr/bin/env python3
"""
concat-segments: собирает recording_NNN.mp4 → recording_full.mp4 без рассинхрона.

Сначала пытается stream-copy (если все сегменты идентичны — это идеально, 0 потерь).
Если параметры различаются — перекодирует с принудительным CFR и async-resample
аудио, чтобы не копился дрейф.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SEGMENT_RE = re.compile(r"^recording_\d{3}\.mp4$")


def ffprobe(path: Path) -> dict | None:
    try:
        out = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=codec_name,width,height,r_frame_rate,pix_fmt",
                "-show_entries",
                "format=duration",
                "-of",
                "json",
                str(path),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        return json.loads(out.stdout)
    except (subprocess.CalledProcessError, json.JSONDecodeError):
        return None


def signature(probe: dict | None) -> tuple | None:
    if not probe or not probe.get("streams"):
        return None
    s = probe["streams"][0]
    return (
        s.get("codec_name"),
        s.get("width"),
        s.get("height"),
        s.get("r_frame_rate"),
        s.get("pix_fmt"),
    )


def run(cmd: list[str]) -> None:
    print(f"  $ {' '.join(str(c) for c in cmd)}")
    subprocess.run(cmd, check=True)


def concat_copy(segments: list[Path], output: Path, cwd: Path) -> None:
    list_file = cwd / "concat_list.txt"
    list_file.write_text(
        "\n".join(f"file '{p.name}'" for p in segments), encoding="utf-8"
    )
    try:
        run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(list_file),
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                str(output),
            ]
        )
    finally:
        if list_file.exists():
            list_file.unlink()


def concat_reencode(segments: list[Path], output: Path, cwd: Path) -> None:
    """Fallback: сегменты с разными параметрами — перекодируем с CFR и async-audio."""
    list_file = cwd / "concat_list.txt"
    list_file.write_text(
        "\n".join(f"file '{p.name}'" for p in segments), encoding="utf-8"
    )
    try:
        run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(list_file),
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-crf",
                "20",
                "-pix_fmt",
                "yuv420p",
                "-vsync",
                "cfr",
                "-r",
                "30",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-ar",
                "48000",
                "-af",
                "aresample=async=1:first_pts=0",
                "-movflags",
                "+faststart",
                str(output),
            ]
        )
    finally:
        if list_file.exists():
            list_file.unlink()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("output_dir", help="projects/<name>/output/")
    ap.add_argument("--force", action="store_true", help="Переcклеить, даже если recording_full.mp4 есть")
    args = ap.parse_args()

    out_dir = Path(args.output_dir).resolve()
    if not out_dir.is_dir():
        print(f"ERROR: {out_dir} не существует или не директория", file=sys.stderr)
        return 2

    full_path = out_dir / "recording_full.mp4"
    if full_path.exists() and not args.force:
        print(f"[skip] {full_path.name} уже существует (используй --force чтобы переcклеить)")
        return 0

    segments = sorted(p for p in out_dir.iterdir() if SEGMENT_RE.match(p.name))
    if not segments:
        print("ERROR: не найдено recording_NNN.mp4 в output/", file=sys.stderr)
        return 3

    print(f"Найдено {len(segments)} сегментов:")
    for p in segments:
        print(f"  - {p.name}")

    if len(segments) == 1:
        print(f"[rename] единственный сегмент → {full_path.name}")
        shutil.copy2(segments[0], full_path)
        return 0

    # Сверяем параметры. Если все одинаковы — stream-copy.
    sigs = [signature(ffprobe(p)) for p in segments]
    unique = {s for s in sigs if s is not None}
    all_same = len(unique) == 1 and None not in sigs

    try:
        if all_same:
            print("[copy] параметры всех сегментов совпадают → stream-copy")
            concat_copy(segments, full_path, out_dir)
        else:
            print("[reencode] параметры сегментов отличаются → перекодирование с CFR")
            concat_reencode(segments, full_path, out_dir)
    except subprocess.CalledProcessError as e:
        print(f"ERROR: ffmpeg упал (код {e.returncode})", file=sys.stderr)
        return e.returncode or 1

    if not full_path.exists():
        print("ERROR: recording_full.mp4 не создан", file=sys.stderr)
        return 4

    size_mb = full_path.stat().st_size / 1024 / 1024
    print(f"[ok] {full_path.name} ({size_mb:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
