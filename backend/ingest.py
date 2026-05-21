"""
BugLens Repository Ingestion Script
=====================================
Walk a local directory, collect all readable source files, and push them to the
/api/v1/chat/ingest endpoint so ChromaDB can index them for RAG queries.

Usage (with venv active):
    python ingest.py

Configuration:
    Edit the three variables in the CONFIGURATION block below.
"""

import os
import sys
import json
import time
import requests

# ---------------------------------------------------------------------------
# CONFIGURATION — edit these three lines before running
# ---------------------------------------------------------------------------
REPO_PATH = "../buglens-core-3d8d2493"   # local path to the repo you want to ingest
REPO_NAME = "owner/my-repo"              # must match the repo_name used in /chat/query
API_URL   = "http://127.0.0.1:8000/api/v1/chat/ingest"
# ---------------------------------------------------------------------------

IGNORED_DIRS = {
    ".git", "node_modules", "venv", "__pycache__", ".next",
    "dist", "build", ".tanstack", ".chroma_db", "coverage",
}

IGNORED_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".zip",
    ".woff", ".woff2", ".ttf", ".eot", ".otf", ".mp4", ".webp",
    ".svg",   # SVG can be text but rarely useful for RAG
    ".lock",  # package-lock.json / bun.lock are too noisy
    ".map",   # source maps
}

MAX_FILE_BYTES = 150_000  # skip files larger than ~150 KB (e.g. minified bundles)


def should_ignore_dir(path: str) -> bool:
    parts = set(path.replace("\\", "/").split("/"))
    return bool(parts & IGNORED_DIRS)


def collect_files(repo_path: str) -> list[dict]:
    files_payload = []
    skipped = 0

    for root, dirs, files in os.walk(repo_path):
        # Prune ignored directories in-place so os.walk doesn't recurse into them
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]

        if should_ignore_dir(root):
            continue

        for filename in files:
            ext = os.path.splitext(filename)[1].lower()
            if ext in IGNORED_EXTENSIONS:
                skipped += 1
                continue

            abs_path = os.path.join(root, filename)

            # Skip large files
            try:
                if os.path.getsize(abs_path) > MAX_FILE_BYTES:
                    skipped += 1
                    continue
            except OSError:
                continue

            try:
                with open(abs_path, "r", encoding="utf-8") as f:
                    content = f.read()
            except (UnicodeDecodeError, OSError):
                skipped += 1
                continue

            rel_path = os.path.relpath(abs_path, repo_path).replace("\\", "/")
            files_payload.append({"path": rel_path, "content": content})

    print(f"  ✔ Collected {len(files_payload)} file(s)  |  skipped {skipped}")
    return files_payload


def ingest(files_payload: list[dict]) -> None:
    payload = {"repo_name": REPO_NAME, "files": files_payload}

    print(f"\nPOST {API_URL}")
    print(f"  repo_name : {REPO_NAME}")
    print(f"  files     : {len(files_payload)}")
    print("  Sending…  (this may take a minute while OpenAI embeds the chunks)\n")

    start = time.time()
    try:
        resp = requests.post(API_URL, json=payload, timeout=300)
    except requests.exceptions.ConnectionError:
        print("❌  Could not connect to the BugLens backend.")
        print("    Is uvicorn running?  →  venv\\Scripts\\uvicorn app.main:app --reload")
        sys.exit(1)

    elapsed = time.time() - start

    # Endpoint returns 202 Accepted on success
    if resp.status_code in (200, 202):
        data = resp.json()
        print(f"✅  Ingestion complete! ({elapsed:.1f}s)")
        print(f"    {data.get('message', json.dumps(data))}")
        print(f"\n    You can now query '{REPO_NAME}' in the Workspace chat.\n")
    else:
        print(f"❌  Server error {resp.status_code}:")
        print(f"    {resp.text}")
        sys.exit(1)


if __name__ == "__main__":
    abs_repo = os.path.abspath(REPO_PATH)
    if not os.path.isdir(abs_repo):
        print(f"❌  REPO_PATH does not exist: {abs_repo}")
        print("    Edit the CONFIGURATION block at the top of ingest.py")
        sys.exit(1)

    print(f"\n🔍  Scanning: {abs_repo}")
    files = collect_files(abs_repo)

    if not files:
        print("❌  No readable files found. Check REPO_PATH and IGNORED_DIRS.")
        sys.exit(1)

    ingest(files)
