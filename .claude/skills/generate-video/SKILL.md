---
name: generate-video
description: Generate background videos using Veo 3 (Google Gemini) or Seedance 2 (PiAPI). Use when creating or regenerating video backgrounds for Reels slides.
allowed-tools: Bash(python3 *)
---

# Generate Video Skill

Two options for video generation:

## Veo 3 (Google Gemini)
```bash
python3 .claude/skills/generate-video/generate_veo.py --prompt "..." --duration 10 --output "path.mp4"
```
Requires: `GEMINI_API_KEY`

## Seedance 2 (PiAPI)
```bash
python3 .claude/skills/generate-video/generate_seedance.py --prompt "..." --duration 10 --output "path.mp4"
```
Requires: `PIAPI_KEY`

## Notes
- Seedance 2 is async: submit → poll → download (~1-2 min)
- Veo 3 may also be async depending on duration
- Always resize result to 1080×1920 after generation
