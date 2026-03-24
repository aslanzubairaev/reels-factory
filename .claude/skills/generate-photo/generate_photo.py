#!/usr/bin/env python3
"""Generate background photo. Tries Gemini first, falls back to DALL-E 3."""

import argparse
import os
import sys
import base64
import requests


def try_gemini(prompt, output_path):
    """Try Google Gemini API for photo generation."""
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key or api_key.startswith('your_') or api_key.startswith('AIzaSy') is False:
        return False

    print("Trying Gemini...")
    try:
        from google import genai

        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.0-flash-preview-image-generation",
            contents=prompt,
            config={"response_modalities": ["IMAGE", "TEXT"]}
        )

        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if hasattr(part, 'inline_data') and part.inline_data:
                    image_data = part.inline_data.data
                    if isinstance(image_data, str):
                        image_data = base64.b64decode(image_data)
                    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
                    with open(output_path, 'wb') as f:
                        f.write(image_data)
                    print(f"Photo saved (Gemini): {output_path}")
                    return True

        print("Gemini: no image in response")
        return False

    except Exception as e:
        print(f"Gemini failed: {e}")
        return False


def try_dalle(prompt, output_path):
    """Try OpenAI DALL-E 3 for photo generation."""
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key or api_key.startswith('your_'):
        return False

    print("Trying DALL-E 3...")
    try:
        import openai

        client = openai.OpenAI(api_key=api_key)
        response = client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            size="1024x1792",
            quality="standard",
            n=1
        )

        url = response.data[0].url
        print("Downloading...")

        os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
        img = requests.get(url, timeout=60)
        img.raise_for_status()

        with open(output_path, 'wb') as f:
            f.write(img.content)

        print(f"Photo saved (DALL-E 3): {output_path} ({len(img.content)} bytes)")
        return True

    except Exception as e:
        print(f"DALL-E 3 failed: {e}")
        return False


def generate_photo(prompt, output_path):
    print(f"Generating photo: {prompt[:80]}...")

    # Try Gemini first
    if try_gemini(prompt, output_path):
        return

    # Fallback to DALL-E 3
    if try_dalle(prompt, output_path):
        return

    # Both failed
    print("ERROR: Both Gemini and DALL-E 3 failed.")
    print("Check your API keys: GEMINI_API_KEY or OPENAI_API_KEY in .env")
    sys.exit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Generate photo (Gemini → DALL-E 3 fallback)')
    parser.add_argument('--prompt', required=True, help='Image generation prompt')
    parser.add_argument('--output', required=True, help='Output JPG file path')
    args = parser.parse_args()
    generate_photo(args.prompt, args.output)
