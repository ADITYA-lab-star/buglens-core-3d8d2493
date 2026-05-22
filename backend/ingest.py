"""
BugLens Repository Ingestion Script
=====================================
Walk a local directory, collect all readable source files, and push them to the
/api/v1/chat/ingest endpoint so ChromaDB can index them for RAG queries.

Usage (with venv active):
    python ingest.py                     # ingest REPO_PATH with default REPO_NAME
    python ingest.py --list              # list all already-ingested repositories

Configuration:
    Edit the three variables in the CONFIGURATION block below.
"""

import argparse
import os
import sys
import json
import time
import requests

# ---------------------------------------------------------------------------
# CONFIGURATION — edit these before running
# ---------------------------------------------------------------------------
REPO_PATH = "../buglens-core-3d8d2493"   # local path to the repo you want to ingest
REPO_NAME = ""                            # leave blank to use the directory's basename
API_BASE  = "http://127.0.0.1:8000/api/v1/chat"
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

    print(f"  \u2714 Collected {len(files_payload)} file(s)  |  skipped {skipped}")
    return files_payload


def ingest(files_payload: list[dict], repo_name: str) -> None:
    url = f"{API_BASE}/ingest"
    payload = {"repo_name": repo_name, "files": files_payload}

    print(f"\nPOST {url}")
    print(f"  repo_name : {repo_name}")
    print(f"  files     : {len(files_payload)}")
    print("  Sending\u2026  (this may take a minute while embeddings are generated)\n")

    start = time.time()
    try:
        resp = requests.post(url, json=payload, timeout=300)
    except requests.exceptions.ConnectionError:
        print("\u274c  Could not connect to the BugLens backend.")
        print("    Is uvicorn running?  \u2192  venv\\Scripts\\uvicorn app.main:app --reload")
        sys.exit(1)

    elapsed = time.time() - start

    # Endpoint returns 202 Accepted on success
    if resp.status_code in (200, 202):
        data = resp.json()
        print(f"\u2705  Ingestion complete! ({elapsed:.1f}s)")
        print(f"    {data.get('message', json.dumps(data))}")
        print(f"\n    You can now query '{repo_name}' in the Workspace \u2192 Repository Q&A tab.\n")
    else:
        print(f"\u274c  Server error {resp.status_code}:")
        print(f"    {resp.text}")
        sys.exit(1)


def list_repos() -> None:
    """Print all ChromaDB collections (already-ingested repositories)."""
    url = f"{API_BASE}/collections"
    try:
        resp = requests.get(url, timeout=10)
    except requests.exceptions.ConnectionError:
        print("\u274c  Could not connect to the BugLens backend.")
        print("    Is uvicorn running?  \u2192  venv\\Scripts\\uvicorn app.main:app --reload")
        sys.exit(1)

    if resp.status_code != 200:
        print(f"\u274c  Server error {resp.status_code}: {resp.text}")
        sys.exit(1)

    collections = resp.json().get("collections", [])
    if not collections:
        print("\u2139\ufe0f   No repositories ingested yet. Run ingest.py first.")
        return

    print(f"\n\U0001f4da  Ingested repositories ({len(collections)}):")
    for name in collections:
        print(f"    \u00b7 {name}")
    print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="BugLens repository ingestion tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List all already-ingested repositories and exit",
    )
    args = parser.parse_args()

    if args.list:
        list_repos()
        sys.exit(0)

    abs_repo = os.path.abspath(REPO_PATH)
    if not os.path.isdir(abs_repo):
        print(f"\u274c  REPO_PATH does not exist: {abs_repo}")
        print("    Edit the CONFIGURATION block at the top of ingest.py")
        sys.exit(1)

    # Default REPO_NAME to the directory's basename if not set
    effective_name = REPO_NAME.strip() or os.path.basename(abs_repo)

    print(f"\n\U0001f50d  Scanning: {abs_repo}")
    print(f"    repo_name will be: {effective_name!r}")
    files = collect_files(abs_repo)

    if not files:
        print("\u274c  No readable files found. Check REPO_PATH and IGNORED_DIRS.")
        sys.exit(1)

    ingest(files, repo_name=effective_name)
