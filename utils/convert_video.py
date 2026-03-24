#!/usr/bin/env python3
"""Converts WebM to MP4 via FFmpeg."""

import argparse
import os
import subprocess
import sys


def convert_video(input_path, output_path=None):
    if not os.path.exists(input_path):
        print(f"ERROR: File not found: {input_path}")
        return False

    if output_path is None:
        output_path = os.path.splitext(input_path)[0] + '.mp4'

    try:
        result = subprocess.run([
            'ffmpeg', '-y',
            '-i', input_path,
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-movflags', '+faststart',
            output_path
        ], capture_output=True, text=True)

        if result.returncode != 0:
            print(f"ERROR: FFmpeg failed: {result.stderr[:500]}")
            return False

        print(f"Converted: {input_path} -> {output_path}")
        return True

    except Exception as e:
        print(f"ERROR: {e}")
        return False


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Convert video to MP4')
    parser.add_argument('--input', required=True, help='Input video file')
    parser.add_argument('--output', default=None, help='Output MP4 file')
    args = parser.parse_args()

    success = convert_video(args.input, args.output)
    sys.exit(0 if success else 1)
