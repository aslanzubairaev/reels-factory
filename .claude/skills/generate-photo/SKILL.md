---
name: generate-photo
description: Generate background photos using Google Gemini API (model gemini-3-pro-image-preview). Use when creating or regenerating background images for Reels slides.
allowed-tools: Bash(python3 *)
---

# Generate Photo Skill

Generates a background photo using Google Gemini API.

## Usage
```bash
python3 .claude/skills/generate-photo/generate_photo.py --prompt "your prompt" --output "path/to/output.jpg"
```

## Requirements
- `GEMINI_API_KEY` in `.env`
- Python package: `google-genai`
- Billing enabled in Google Cloud Console

## Notes
- Model: `gemini-3-pro-image-preview` (formerly known as "Nanobanana")
- NEVER use `api.nanobanana.com` — it does not exist
- Output: JPG file
- Prompt should include: `background plate for talking head video, 9:16 vertical portrait orientation`
