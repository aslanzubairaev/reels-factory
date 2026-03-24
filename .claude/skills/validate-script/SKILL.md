---
name: validate-script
description: Validate a script JSON file against the schema and business rules. Use after generating or editing 02_script.json.
allowed-tools: Bash(python3 *)
---

# Validate Script Skill

Validates `02_script.json` against JSON Schema and business rules.

## Usage
```bash
python3 .claude/skills/validate-script/validate.py projects/[name]/02_script.json
```

## Checks
- JSON Schema validation (all required fields, enums, types)
- Total duration ≤ 90 seconds
- Sum of parts timing = total_duration_seconds
- face_only parts have background_type="none" and empty background_prompt
- Part numbers are sequential
