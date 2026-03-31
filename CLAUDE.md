# Reels Factory — Claude Code Instructions

## Project Overview

Multi-agent system for creating Instagram Reels. User talks to Claude Code → Claude manages agents → generates content → web studio for recording.

## Structure

- **Agents:** `.claude/agents/*.md` — independent instruction files, NOT folders
- **Skills:** `.claude/skills/*/` — Python scripts for API calls, each with `SKILL.md` (YAML frontmatter required)
- **Hooks:** `.claude/hooks/bash/` — protection scripts (e.g., block .env commits)
- **Studio:** `studio/` — Node.js server + web frontend
- **Projects:** `projects/` — one folder per Reel (gitignored)

## Critical Rules

1. **Nanobanana = Google Gemini API** — NEVER use `api.nanobanana.com` (it doesn't exist). Use `google-genai` SDK with model `gemini-3-pro-image-preview`.
2. **API Keys:**
   - `GEMINI_API_KEY` — for photo (Gemini) AND video (Veo 3)
   - `PIAPI_KEY` — for video (Seedance 2 via PiAPI)
   - `ANTHROPIC_API_KEY` — for text, search, translation
3. **Never commit .env** — contains API keys
4. **Never modify `.claude/settings.json`** or `.claude/settings.local.json`
5. **Agents are .md files**, not folders. Python scripts go in `.claude/skills/`.

## Pipeline

1. Config Agent (optional) → `config/profile.md`
2. Trend Agent → `projects/[name]/01_trend.md`
3. Script Agent → `projects/[name]/02_script.json` + `03_hashtags.md`
4. Visual Agent → `projects/[name]/assets/backgrounds/`
5. Web Studio → `projects/[name]/output/recording_*.mp4`

## Validation

After every script generation/edit: `python3 .claude/skills/validate-script/validate.py projects/[name]/02_script.json`

## Background Prompt Rules

Every background prompt MUST include:
```
background plate for talking head video, soft even lighting,
no harsh shadows, no foreground objects, color palette compatible
with indoor skin tones, 9:16 vertical portrait orientation
```

## Instagram Safe Zones (CRITICAL)

All visual content MUST respect Instagram Reels safe zones:
- **Right 15%** (162px of 1080) — engagement buttons (like, comment, share)
- **Bottom 30%** (570px of 1920) — description zone + camera overlay area
- **Top 8%** (150px of 1920) — app menu bar

**For AI photo/video backgrounds:** important visual elements (text, objects of interest) must be placed in the upper 70% and left 85% of the frame. The bottom 30% will be covered by the camera overlay.

**For HTML slides:** templates have built-in safe zone padding (150px top, 160px right, 570px bottom, 60px left).
