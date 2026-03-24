# Reels Factory v2

Multi-agent system for creating Instagram Reels — from trending ideas to recorded video.

Built for Cursor + Claude Code. You talk to Claude in the terminal, it manages agents, generates content, and launches a web studio for recording.

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/your-username/reels-factory.git
cd reels-factory

# 2. Setup
chmod +x setup.sh
./setup.sh

# 3. Add API keys to .env (see below)

# 4. Start
# Open Cursor, launch Claude Code, type:
# "I want to create a Reel"
```

---

## API Keys

Open `.env` and add your keys:

| Key | Service | Required | Get it at |
|-----|---------|----------|-----------|
| `GEMINI_API_KEY` | Google Gemini (photo + video) | Yes | https://aistudio.google.com |
| `PIAPI_KEY` | PiAPI / Seedance 2 (video) | Optional | https://piapi.ai |
| `ANTHROPIC_API_KEY` | Claude (text, search, translation) | Yes | https://console.anthropic.com |
| `OPENAI_API_KEY` | OpenAI (fallback) | No | https://platform.openai.com |

**IMPORTANT:** Enable billing in Google Cloud Console for image generation. Free tier does not support image generation.

---

## System Requirements

- **OS:** macOS 12+ / Windows 10+ / Ubuntu 20.04+
- **CPU:** 4+ cores, **RAM:** 8+ GB
- **Browser:** Chrome 100+ or Safari 16+
- **Node.js:** 18+, **Python:** 3.9+, **FFmpeg** in PATH
- **Cursor** with Claude Code

---

## How It Works

```
1. Config Agent (optional)  — Set up creator profile
2. Trend Agent              — Find trending ideas (with format filter)
3. Script Agent             — 2-3 script variants + Hook Analyzer + CTA + hashtags
4. Visual Agent             — 2-3 background variants per slide
5. Web Studio               — Preview, customize camera, record
```

### Step by Step

**1. Profile (optional):** "Set up my profile" → niche, audience, tone, style → `config/profile.md`

**2. Ideas:** "Find Reel ideas about travel" → 5-10 ideas with audience value → pick one

**3. Script:** "Write script in Russian" → 2-3 variants → Hook analysis → CTA → hashtags → `02_script.json` + `03_hashtags.md`

**4. Backgrounds:** "Generate backgrounds" → 2-3 variants per slide → pick best → `assets/backgrounds/`

**5. Studio:** `node studio/server.js` → http://localhost:3000 → preview → record → MP4

---

## Web Studio v2

```bash
node studio/server.js
# Open http://localhost:3000
```

### Settings
- Project, camera, microphone selection
- Quality: 1080p / 720p
- Camera shape: circle / rounded rectangle / oval
- Theme: dark / light

### Preview Mode
- Phone frame (9:16) with live camera + backgrounds
- Camera zoom slider (1.0x - 3.0x)
- Mirror toggle
- Background prompt editing (in your language, auto-translated)
- Regenerate backgrounds with spinner
- Navigate slides with arrow keys

### Recording Mode
- Large teleprompter (32px) with auto-scroll
- Countdown 3-2-1
- Timer per slide
- Mirror toggle for recording
- Two modes: continuous / per-part
- Review before saving

### Hotkeys

| Key | Action |
|-----|--------|
| `Arrow Left/Right` | Navigate slides |
| `Space` | Start / Stop recording |
| `R` | Re-record current part |
| `Esc` | Back to Preview |

---

## Project Structure

```
reels-factory/
├── .env.example                 # API keys template
├── CLAUDE.md                    # Instructions for Claude Code
├── package.json / requirements.txt / setup.sh
│
├── .claude/
│   ├── agents/                  # Agent instructions (.md files)
│   │   ├── config-agent.md
│   │   ├── trend-agent.md
│   │   ├── script-agent.md
│   │   └── visual-agent.md
│   ├── skills/                  # API scripts (SKILL.md + .py)
│   │   ├── generate-photo/
│   │   ├── generate-video/
│   │   ├── validate-script/
│   │   └── resize-asset/
│   └── hooks/bash/              # Git hooks
│
├── agents/PIPELINE.md           # Pipeline docs for users
├── studio/                      # Node.js server + web frontend
├── schemas/script.schema.json   # JSON Schema
├── projects/                    # Your Reels (gitignored)
├── history/history.json         # Project history
└── utils/                       # Utility scripts
```

---

## FAQ

**Q: What is "Nanobanana"?**
A: It's the codename for Google Gemini's image generation model (`gemini-3-pro-image-preview`). It uses the same `GEMINI_API_KEY`. There is no separate "nanobanana.com" service.

**Q: Do I need billing enabled?**
A: Yes, for image generation. Google's free tier doesn't support it. Enable at console.cloud.google.com.

**Q: What languages are supported?**
A: Any language. Prompts are auto-translated to English for better generation quality. You see and edit prompts in your language.

**Q: How long can a Reel be?**
A: Maximum 90 seconds (Instagram limit). The validator enforces this.

**Q: Can I use my own idea?**
A: Yes. Say "I have my own idea: ..." and Claude will structure it.

---

## Troubleshooting

**Image generation fails with 403**
- Enable billing in Google Cloud Console
- Check that `GEMINI_API_KEY` starts with `AIzaSy...`

**Camera not showing**
- Allow camera/microphone in browser settings
- Use Chrome (recommended)

**FFmpeg not found**
```bash
brew install ffmpeg        # macOS
sudo apt install ffmpeg    # Ubuntu
winget install ffmpeg      # Windows
```

**Background looks wrong (black bars)**
- Backgrounds are auto-resized to 1080x1920
- If issue persists, regenerate the background

---

## License

MIT
