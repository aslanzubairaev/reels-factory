#!/usr/bin/env python3
"""Generate background video using PiAPI Seedance 2."""

import argparse
import os
import sys
import time
import requests


def generate_video(prompt, duration, output_path):
    api_key = os.getenv('PIAPI_KEY')
    if not api_key or api_key.startswith('your_'):
        print("ERROR: PIAPI_KEY not set in .env")
        print("Get it at: piapi.ai → Sign Up → Workspace → API Key")
        sys.exit(1)

    print(f"Generating video (Seedance 2): {prompt[:80]}...")

    try:
        # Submit task
        response = requests.post(
            "https://api.piapi.ai/api/v1/task",
            headers={
                "X-API-Key": api_key,
                "Content-Type": "application/json"
            },
            json={
                "model": "seedance",
                "task_type": "seedance-2-preview",
                "input": {
                    "prompt": prompt,
                    "duration": duration,
                    "aspect_ratio": "9:16"
                }
            },
            timeout=30
        )
        response.raise_for_status()
        data = response.json()

        task_id = data.get("data", {}).get("task_id") or data.get("task_id")
        if not task_id:
            print(f"ERROR: No task_id in response: {data}")
            sys.exit(1)

        print(f"Task submitted: {task_id}")
        print("Polling for result (~1-2 min)...")

        # Poll for result (max 5 min, every 5 sec)
        timeout = 300
        start = time.time()
        while time.time() - start < timeout:
            time.sleep(5)

            status_resp = requests.get(
                f"https://api.piapi.ai/api/v1/task/{task_id}",
                headers={"X-API-Key": api_key},
                timeout=15
            )
            status_data = status_resp.json()
            task_data = status_data.get("data", status_data)
            status = task_data.get("status", "")

            if status == "completed":
                video_url = task_data.get("output", {}).get("video") or \
                           task_data.get("output", {}).get("video_url") or \
                           task_data.get("output", {}).get("url", "")
                if not video_url:
                    print(f"ERROR: No video URL in completed task")
                    sys.exit(1)

                # Download video
                os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
                vid_resp = requests.get(video_url, timeout=120)
                vid_resp.raise_for_status()
                with open(output_path, 'wb') as f:
                    f.write(vid_resp.content)
                print(f"Video saved: {output_path}")
                return output_path

            elif status == "failed":
                error = task_data.get("error", "Unknown error")
                print(f"ERROR: Generation failed: {error}")
                sys.exit(1)

            elapsed = int(time.time() - start)
            print(f"  Status: {status} ({elapsed}s elapsed)")

        print("ERROR: Video generation timed out (5 min)")
        sys.exit(1)

    except requests.exceptions.RequestException as e:
        print(f"ERROR: API request failed: {e}")
        sys.exit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Generate video via PiAPI Seedance 2')
    parser.add_argument('--prompt', required=True)
    parser.add_argument('--duration', required=True, type=int, help='Duration in seconds')
    parser.add_argument('--output', required=True, help='Output MP4 file path')
    args = parser.parse_args()
    generate_video(args.prompt, args.duration, args.output)
