#!/usr/bin/env python3
"""Validates a script JSON file against the schema and business rules."""


import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import json
import sys
import os
from jsonschema import validate, ValidationError

SCHEMA_PATH = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'schemas', 'script.schema.json')

VALID_SLIDE_CATEGORIES = {'infographic', 'comparison', 'text_slide', 'mockup'}
SCREEN_CAPTURE_TYPES = {'screen', 'screen_capture'}

INFOGRAPHIC_REQUIRED = {'title', 'items'}
COMPARISON_REQUIRED = {'left_title', 'right_title', 'left_items', 'right_items'}
TEXT_SLIDE_REQUIRED = {'text'}
MOCKUP_REQUIRED = {'title', 'rows'}

SLIDE_DATA_FIELDS = {
    'infographic': INFOGRAPHIC_REQUIRED,
    'comparison': COMPARISON_REQUIRED,
    'text_slide': TEXT_SLIDE_REQUIRED,
    'mockup': MOCKUP_REQUIRED,
}


def validate_script(script_path):
    errors = []

    try:
        with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
            schema = json.load(f)
    except FileNotFoundError:
        print(f"ERROR: Schema not found at {SCHEMA_PATH}")
        return False

    try:
        with open(script_path, 'r', encoding='utf-8') as f:
            script = json.load(f)
    except FileNotFoundError:
        print(f"ERROR: File not found: {script_path}")
        return False
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON: {e}")
        return False

    try:
        validate(instance=script, schema=schema)
    except ValidationError as e:
        errors.append(f"Schema error: {e.message}")

    parts = script.get('parts', [])
    total_declared = script.get('total_duration_seconds', 0)
    total_actual = sum(p.get('timing_seconds', 0) for p in parts)

    if total_actual != total_declared:
        errors.append(f"Duration mismatch: declared={total_declared}, actual sum={total_actual}")

    if total_actual > 90:
        errors.append(f"Total duration {total_actual}s exceeds 90s limit")

    for p in parts:
        pn = p.get('part_number', '?')
        bg_type = p.get('background_type', 'none')

        # face_only checks
        if p.get('layout') == 'face_only':
            if bg_type != 'none':
                errors.append(f"Part {pn}: face_only must have background_type='none', got '{bg_type}'")
            if p.get('background_prompt', '') != '':
                errors.append(f"Part {pn}: face_only must have empty background_prompt")

        # W-020: claim and visual_proof required for generated/static visual backgrounds.
        # Screen capture is selected live in Studio, so older Studio drafts may not have these fields.
        if bg_type != 'none' and bg_type not in SCREEN_CAPTURE_TYPES:
            if not p.get('claim', '').strip():
                errors.append(f"Part {pn}: 'claim' is required when background_type='{bg_type}'")
            if not p.get('visual_proof', '').strip():
                errors.append(f"Part {pn}: 'visual_proof' is required when background_type='{bg_type}'")

        # Screen capture: live screen, no AI prompt, no slide data
        if bg_type in SCREEN_CAPTURE_TYPES:
            if p.get('background_prompt', '') != '':
                errors.append(f"Part {pn}: screen_capture must have empty background_prompt")
            if p.get('slide_data'):
                errors.append(f"Part {pn}: screen_capture must not have slide_data")

        # W-017: html_slide must not have AI prompt
        if bg_type == 'html_slide':
            if p.get('background_prompt', '') != '':
                errors.append(f"Part {pn}: html_slide must have empty background_prompt")

            # background_category required for html_slide
            cat = p.get('background_category', '')
            if cat not in VALID_SLIDE_CATEGORIES:
                errors.append(f"Part {pn}: html_slide requires background_category in {VALID_SLIDE_CATEGORIES}, got '{cat}'")

            # W-029: slide_data validation
            slide_data = p.get('slide_data')
            if not slide_data or not isinstance(slide_data, dict):
                errors.append(f"Part {pn}: html_slide requires 'slide_data' object")
            elif cat in SLIDE_DATA_FIELDS:
                required = SLIDE_DATA_FIELDS[cat]
                missing = required - set(slide_data.keys())
                if missing:
                    errors.append(f"Part {pn}: slide_data for '{cat}' missing fields: {missing}")

    part_numbers = [p.get('part_number', 0) for p in parts]
    expected = list(range(1, len(parts) + 1))
    if part_numbers != expected:
        errors.append(f"Part numbers should be {expected}, got {part_numbers}")

    if errors:
        print("VALIDATION FAILED:")
        for e in errors:
            print(f"  - {e}")
        return False
    else:
        print("Validation passed.")
        return True


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python validate.py <path_to_script.json>")
        sys.exit(1)
    success = validate_script(sys.argv[1])
    sys.exit(0 if success else 1)
