#!/usr/bin/env python3
"""
Финальная очистка output/ проекта — оставить только 5 файлов для Instagram.

Оставляет:
  final_video_subs.mp4, cover_final.png, caption.txt,
  first_comment.txt, hashtags.txt

Удаляет всё остальное в output/: транскрипты, промежуточные JSON,
cover_candidates/, webm-бэкапы, версии слайдов и т.д.

Использование:
  python cleanup.py projects/<name>/ [--keep-transcripts] [--dry-run]
"""

import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import argparse
import shutil
from pathlib import Path


# Файлы, которые мы оставляем в output/
KEEP_ALWAYS = {
    "final_video_subs.mp4",
    "cover_final.png",
    "caption.txt",
    "first_comment.txt",
    "hashtags.txt",
}

# Дополнительно оставляем при --keep-transcripts
KEEP_WITH_TRANSCRIPTS = {
    "transcript.txt",
    "transcript.srt",
    "subtitles.ass",
}


def cleanup(project_dir: Path, keep_transcripts: bool, dry_run: bool) -> None:
    output = project_dir / "output"
    if not output.is_dir():
        print(f"ERROR: {output} не существует или не папка.")
        sys.exit(1)

    # Если пропустили субтитры — переименовываем recording_full.mp4.
    final = output / "final_video_subs.mp4"
    recording = output / "recording_full.mp4"
    if not final.exists() and recording.exists():
        if dry_run:
            print(f"[dry-run] RENAME: {recording.name} -> final_video_subs.mp4")
        else:
            recording.rename(final)
            print(f"RENAMED: {recording.name} -> final_video_subs.mp4")

    keep = set(KEEP_ALWAYS)
    if keep_transcripts:
        keep |= KEEP_WITH_TRANSCRIPTS

    action = "[dry-run] REMOVE" if dry_run else "REMOVED"
    removed_files = 0
    removed_dirs = 0
    kept_files = 0
    total_freed = 0

    for entry in sorted(output.iterdir()):
        if entry.is_file():
            if entry.name in keep:
                kept_files += 1
                print(f"KEEP:  {entry.name}")
                continue
            size = entry.stat().st_size
            if not dry_run:
                entry.unlink()
            print(f"{action}: {entry.name}  ({_fmt_size(size)})")
            removed_files += 1
            total_freed += size
        elif entry.is_dir():
            size = _dir_size(entry)
            if not dry_run:
                shutil.rmtree(entry)
            print(f"{action} dir: {entry.name}/  ({_fmt_size(size)})")
            removed_dirs += 1
            total_freed += size

    print()
    print(f"Kept:    {kept_files} files")
    print(f"Removed: {removed_files} files + {removed_dirs} directories")
    print(f"Freed:   {_fmt_size(total_freed)}")

    # Финальная проверка — сколько файлов осталось
    remaining = [e.name for e in output.iterdir()]
    missing = keep - set(remaining)
    if missing:
        print()
        print(f"ВНИМАНИЕ: отсутствуют ожидаемые файлы: {sorted(missing)}")


def _dir_size(path: Path) -> int:
    total = 0
    for p in path.rglob("*"):
        if p.is_file():
            total += p.stat().st_size
    return total


def _fmt_size(size: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024:
            return f"{size:.1f}{unit}"
        size /= 1024
    return f"{size:.1f}TB"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("project_dir", help="Путь к папке проекта (projects/<name>/)")
    ap.add_argument("--keep-transcripts", action="store_true",
                    help="Оставить transcript.txt/.srt + subtitles.ass")
    ap.add_argument("--dry-run", action="store_true",
                    help="Показать что будет удалено, не удалять")
    args = ap.parse_args()

    project_dir = Path(args.project_dir).resolve()
    if not project_dir.is_dir():
        print(f"ERROR: {project_dir} не папка.")
        sys.exit(1)

    print(f"Cleanup: {project_dir}")
    print("-" * 60)
    cleanup(project_dir, args.keep_transcripts, args.dry_run)


if __name__ == "__main__":
    main()
