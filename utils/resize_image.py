#!/usr/bin/env python3
"""Resizes images to 1080x1920 (9:16 vertical)."""

import argparse
import os
import sys

TARGET_WIDTH = 1080
TARGET_HEIGHT = 1920


def resize_image(input_path, output_path=None):
    try:
        from PIL import Image

        if not os.path.exists(input_path):
            print(f"ERROR: File not found: {input_path}")
            return False

        if output_path is None:
            output_path = input_path

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

        img.save(output_path, quality=95)
        print(f"Resized to {TARGET_WIDTH}x{TARGET_HEIGHT}: {output_path}")
        return True

    except Exception as e:
        print(f"ERROR: {e}")
        return False


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Resize image to 1080x1920')
    parser.add_argument('--input', required=True, help='Input image file')
    parser.add_argument('--output', default=None, help='Output file (default: overwrite input)')
    args = parser.parse_args()

    success = resize_image(args.input, args.output)
    sys.exit(0 if success else 1)
