#!/usr/bin/env python3
"""
Versioning utility — renames current file to _vN before overwriting.

Usage:
    python3 utils/version_file.py <file_path>

If the file exists, it will be renamed to filename_vN.ext where N is the
next available version number. If the file doesn't exist, nothing happens.

Example:
    python3 utils/version_file.py projects/my-project/02_script.json
    # 02_script.json -> 02_script_v1.json (or _v2, _v3, etc.)
"""

import os
import re
import sys
import glob


def version_file(file_path):
    """Rename file to next versioned name. Returns new path or None."""
    if not os.path.exists(file_path):
        return None

    directory = os.path.dirname(file_path)
    basename = os.path.basename(file_path)
    name, ext = os.path.splitext(basename)

    # Find next version number
    version = 1
    pattern = os.path.join(directory, f"{name}_v*{ext}")
    existing = glob.glob(pattern)

    if existing:
        numbers = []
        for f in existing:
            match = re.search(r'_v(\d+)', os.path.basename(f))
            if match:
                numbers.append(int(match.group(1)))
        if numbers:
            version = max(numbers) + 1

    versioned_path = os.path.join(directory, f"{name}_v{version}{ext}")
    os.rename(file_path, versioned_path)
    print(f"Versioned: {basename} -> {os.path.basename(versioned_path)}")
    return versioned_path


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python3 version_file.py <file_path>")
        sys.exit(1)

    result = version_file(sys.argv[1])
    if result is None:
        print(f"File not found, nothing to version: {sys.argv[1]}")
    sys.exit(0)
