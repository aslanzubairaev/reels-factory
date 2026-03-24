#!/usr/bin/env python3
"""Generate background video using Google Gemini Veo 3 API."""

import argparse
import os
import sys
import time


def generate_video(prompt, duration, output_path):
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key or api_key.startswith('your_'):
        print("ERROR: GEMINI_API_KEY not set in .env")
        sys.exit(1)

    print(f"Generating video (Veo 3): {prompt[:80]}...")

    try:
        from google import genai

        client = genai.Client(api_key=api_key)
        operation = client.models.generate_videos(
            model="veo-3.1-generate-preview",
            prompt=prompt,
        )

        # Poll for completion
        print("Waiting for video generation...")
        timeout = 300  # 5 minutes
        start = time.time()
        while not operation.done:
            if time.time() - start > timeout:
                print("ERROR: Video generation timed out (5 min)")
                sys.exit(1)
            time.sleep(5)
            operation = client.operations.get(operation)

        # Download result
        os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)

        if operation.response and operation.response.generated_videos:
            video = operation.response.generated_videos[0]
            video_data = client.files.download(file=video.video)
            with open(output_path, 'wb') as f:
                f.write(video_data)
            print(f"Video saved: {output_path}")
            return output_path

        print("ERROR: No video in API response")
        sys.exit(1)

    except ImportError:
        print("ERROR: google-genai not installed. Run: pip install google-genai")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Generate video via Gemini Veo 3')
    parser.add_argument('--prompt', required=True)
    parser.add_argument('--duration', required=True, type=int, help='Duration in seconds')
    parser.add_argument('--output', required=True, help='Output MP4 file path')
    args = parser.parse_args()
    generate_video(args.prompt, args.duration, args.output)
