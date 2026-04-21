#!/usr/bin/env python3
"""Resizes/crops assets to 1080x1920 (9:16 vertical)."""


import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import argparse
import os
import subprocess
import sys

TARGET_WIDTH = 1080
TARGET_HEIGHT = 1920


def resize_image(input_path):
    try:
        from PIL import Image
        img = Image.open(input_path)
        orig_w, orig_h = img.size

        if orig_w == TARGET_WIDTH and orig_h == TARGET_HEIGHT:
            print(f"Already {TARGET_WIDTH}x{TARGET_HEIGHT}: {input_path}")
            return True

        target_ratio = TARGET_WIDTH / TARGET_HEIGHT
        orig_ratio = orig_w / orig_h

        if orig_ratio > target_ratio:
            new_h = TARGET_HEIGHT
            new_w = int(orig_w * (TARGET_HEIGHT / orig_h))
        else:
            new_w = TARGET_WIDTH
            new_h = int(orig_h * (TARGET_WIDTH / orig_w))

        img = img.resize((new_w, new_h), Image.LANCZOS)
        left = (new_w - TARGET_WIDTH) // 2
        top = (new_h - TARGET_HEIGHT) // 2
        img = img.crop((left, top, left + TARGET_WIDTH, top + TARGET_HEIGHT))
        img.save(input_path, quality=95)
        print(f"Resized to {TARGET_WIDTH}x{TARGET_HEIGHT}: {input_path}")
        return True
    except Exception as e:
        print(f"ERROR resizing image: {e}")
        return False


def resize_video(input_path, duration=None):
    try:
        scale_filter = (
            f"scale={TARGET_WIDTH}:{TARGET_HEIGHT}:"
            f"force_original_aspect_ratio=increase,"
            f"crop={TARGET_WIDTH}:{TARGET_HEIGHT}"
        )
        temp_path = input_path + '.tmp.mp4'
        cmd = ['ffmpeg', '-y', '-i', input_path]

        if duration:
            probe = subprocess.run(
                ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                 '-of', 'default=noprint_wrappers=1:nokey=1', input_path],
                capture_output=True, text=True
            )
            video_duration = float(probe.stdout.strip()) if probe.stdout.strip() else 0
            if video_duration < duration:
                loop_count = int(duration / video_duration) + 1
                cmd = ['ffmpeg', '-y', '-stream_loop', str(loop_count), '-i', input_path]
            cmd.extend(['-t', str(duration)])

        cmd.extend(['-vf', scale_filter, '-c:v', 'libx264', '-preset', 'medium',
                     '-crf', '18', '-c:a', 'aac', '-movflags', '+faststart', temp_path])

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"ERROR: FFmpeg failed: {result.stderr[:500]}")
            return False

        os.replace(temp_path, input_path)
        print(f"Video resized to {TARGET_WIDTH}x{TARGET_HEIGHT}: {input_path}")
        return True
    except Exception as e:
        print(f"ERROR resizing video: {e}")
        if os.path.exists(input_path + '.tmp.mp4'):
            os.remove(input_path + '.tmp.mp4')
        return False


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Resize asset to 1080x1920')
    parser.add_argument('--input', required=True)
    parser.add_argument('--duration', type=int, default=None)
    args = parser.parse_args()

    ext = os.path.splitext(args.input)[1].lower()
    if ext in ('.jpg', '.jpeg', '.png', '.webp'):
        success = resize_image(args.input)
    elif ext in ('.mp4', '.webm', '.mov'):
        success = resize_video(args.input, args.duration)
    else:
        print(f"ERROR: Unsupported format: {ext}")
        success = False
    sys.exit(0 if success else 1)
