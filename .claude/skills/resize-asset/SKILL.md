---
name: resize-asset
description: Resize and crop photos and videos to 1080x1920 (9:16 vertical). Use after generating any background asset.
allowed-tools: Bash(python *)
---

# Resize Asset Skill

Resizes/crops assets to exactly 1080×1920 (9:16 vertical portrait).

## Usage
```bash
# Image
python .claude/skills/resize-asset/resize.py --input "path/to/image.jpg"

# Video (with target duration)
python .claude/skills/resize-asset/resize.py --input "path/to/video.mp4" --duration 10
```

## Notes
- Images: center-crop to fill 1080×1920, high quality (LANCZOS)
- Videos: resize + crop to 1080×1920, loop if shorter than duration, trim if longer
- Requires: Pillow (images), FFmpeg (videos)
