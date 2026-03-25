---
name: generate-html-slide
description: Generate HTML slide backgrounds (infographic, comparison, text-slide, mockup) by rendering HTML templates with data via Puppeteer to PNG. Use when background_type is html_slide.
allowed-tools: Bash(node *)
---

# Generate HTML Slide Skill

Renders an HTML template with slide data into a 1080x1920 PNG image.

## Usage
```bash
node .claude/skills/generate-html-slide/generate_slide.js --template "infographic" --data '{"title":"...","items":[...]}' --output "path/to/output.png"
```

## Parameters
- `--template` — one of: infographic, comparison, text-slide, mockup
- `--data` — JSON string with slide data
- `--output` — output PNG path

## Requirements
- `puppeteer` npm package (installed in project root)

## Templates
- **infographic** — large numbers, icons, progress bars. Required data: `title`, `items[]` (each: `icon`, `value`, `label`, optional `progress`)
- **comparison** — left vs right columns. Required data: `left_title`, `right_title`, `left_items[]`, `right_items[]`
- **text-slide** — one big statement. Required data: `text`, optional `subtitle`, `font_size`
- **mockup** — dashboard/interface mockup. Required data: `title`, `columns[]`, `rows[]`

## Notes
- Output is always 1080x1920 PNG (W-015)
- Templates support Cyrillic via Google Fonts (W-016)
- Do NOT call AI APIs for html_slide (W-017)
