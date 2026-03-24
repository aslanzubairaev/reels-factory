#!/usr/bin/env python3
"""Generate background photo using Google Gemini API (gemini-3-pro-image-preview)."""

import argparse
import os
import sys
import base64

def generate_photo(prompt, output_path):
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key or api_key.startswith('your_'):
        print("ERROR: GEMINI_API_KEY not set in .env")
        print("Get it at: https://aistudio.google.com → Get API Key")
        print("IMPORTANT: Enable billing in Google Cloud Console for image generation")
        sys.exit(1)

    print(f"Generating photo: {prompt[:80]}...")

    try:
        from google import genai

        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-3-pro-image-preview",
            contents=prompt,
            config={"response_modalities": ["IMAGE"]}
        )

        # Extract image from response
        os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)

        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if hasattr(part, 'inline_data') and part.inline_data:
                    image_data = part.inline_data.data
                    if isinstance(image_data, str):
                        image_data = base64.b64decode(image_data)
                    with open(output_path, 'wb') as f:
                        f.write(image_data)
                    print(f"Photo saved: {output_path}")
                    return output_path

        print("ERROR: No image in API response")
        sys.exit(1)

    except ImportError:
        print("ERROR: google-genai not installed. Run: pip install google-genai")
        sys.exit(1)
    except Exception as e:
        error_msg = str(e)
        if '403' in error_msg or 'billing' in error_msg.lower():
            print("ERROR: Billing required for image generation.")
            print("Enable billing: console.cloud.google.com → Billing")
        else:
            print(f"ERROR: {e}")
        sys.exit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Generate photo via Gemini API')
    parser.add_argument('--prompt', required=True, help='Image generation prompt')
    parser.add_argument('--output', required=True, help='Output JPG file path')
    args = parser.parse_args()
    generate_photo(args.prompt, args.output)
