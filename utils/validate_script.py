#!/usr/bin/env python3
"""Validates a script JSON file against the schema and business rules."""

import json
import sys
import os

from jsonschema import validate, ValidationError

SCHEMA_PATH = os.path.join(os.path.dirname(__file__), '..', 'schemas', 'script.schema.json')


def validate_script(script_path):
    errors = []

    # Load schema
    try:
        with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
            schema = json.load(f)
    except FileNotFoundError:
        print(f"ERROR: Schema not found at {SCHEMA_PATH}")
        return False

    # Load script
    try:
        with open(script_path, 'r', encoding='utf-8') as f:
            script = json.load(f)
    except FileNotFoundError:
        print(f"ERROR: File not found: {script_path}")
        return False
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON: {e}")
        return False

    # JSON Schema validation
    try:
        validate(instance=script, schema=schema)
    except ValidationError as e:
        errors.append(f"Schema error: {e.message}")

    # Business rules
    parts = script.get('parts', [])
    total_declared = script.get('total_duration_seconds', 0)

    # Check total timing
    total_actual = sum(p.get('timing_seconds', 0) for p in parts)
    if total_actual != total_declared:
        errors.append(
            f"Duration mismatch: total_duration_seconds={total_declared}, "
            f"but sum of parts={total_actual}"
        )

    if total_actual > 90:
        errors.append(f"Total duration {total_actual}s exceeds 90s limit")

    # Check face_only rules
    for p in parts:
        pn = p.get('part_number', '?')
        if p.get('layout') == 'face_only':
            if p.get('background_type') != 'none':
                errors.append(
                    f"Part {pn}: face_only must have background_type='none', "
                    f"got '{p.get('background_type')}'"
                )
            if p.get('background_prompt', '') != '':
                errors.append(
                    f"Part {pn}: face_only must have empty background_prompt"
                )

    # Check part numbers are sequential
    part_numbers = [p.get('part_number', 0) for p in parts]
    expected = list(range(1, len(parts) + 1))
    if part_numbers != expected:
        errors.append(f"Part numbers should be {expected}, got {part_numbers}")

    # Results
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
        print("Usage: python3 validate_script.py <path_to_script.json>")
        sys.exit(1)

    success = validate_script(sys.argv[1])
    sys.exit(0 if success else 1)
