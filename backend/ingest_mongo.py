"""
BugLens — MongoDB Atlas Vector Search Ingestion Script (Gemini)
================================================================
Walks a local repository, chunks every source file, generates embeddings via
the Gemini REST API (gemini-embedding-001), and stores the results in a MongoDB
collection named ``code_chunks`` — ready for Atlas Vector Search queries.

Features
--------
- Automatic retry with exponential backoff on 429 rate-limit errors
- Resume support: re-running skips files already fully ingested
- Configurable inter-batch delay to stay within free-tier limits

Collection schema (code_chunks)
--------------------------------
{
    "repository_name": str,          # Logical name for the repo (e.g. "buglens-core")
    "file_path":        str,          # Relative path inside the repo
    "text":             str,          # Raw source text of this chunk
    "chunk_index":      int,          # 0-based index within the file
    "embedding":        list[float],  # 768-d Gemini text-embedding-004 vector
    "embedding_model":  str,          # "text-embedding-004"
    "token_count":      int,          # Approximate token count of the chunk
    "ingested_at":      datetime,     # UTC timestamp of ingestion
}

Usage
-----
    python ingest_mongo.py                          # ingest REPO_PATH
    python ingest_mongo.py --repo-name my-api       # override the logical repo name
    python ingest_mongo.py --list                   # list all repos already ingested
    python ingest_mongo.py --delete my-api          # remove all chunks for a repo

Atlas Vector Search Index (create once via Atlas UI)
-----------------------------------------------------
    Collection : buglens.code_chunks
    Field      : embedding
    Dimensions : 768
    Similarity : cosine
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# CONFIGURATION — edit these before running
# ---------------------------------------------------------------------------
REPO_PATH  = ".."          # path to the repo you want to ingest
REPO_NAME  = ""            # leave blank → uses the directory basename
CHUNK_TOKENS  = 400        # target tokens per chunk
CHUNK_OVERLAP = 50         # token overlap between adjacent chunks
BATCH_SIZE    = 10         # chunks per Gemini API request (smaller = safer on free tier)
BATCH_DELAY   = 3.0        # seconds to wait between batches (avoids 429)
MAX_RETRIES   = 5          # max retries per batch on 429
# ---------------------------------------------------------------------------

load_dotenv()

MONGO_URL   = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
GEMINI_KEY  = os.getenv("GEMINI_API_KEY", "")

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMS  = 3072

# Gemini REST endpoint — v1beta (required for gemini-embedding-001)
GEMINI_EMBED_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{EMBEDDING_MODEL}:batchEmbedContents"
)

IGNORED_DIRS = {
    ".git", "node_modules", "venv", "__pycache__", ".next",
    "dist", "build", ".tanstack", ".chroma_db", "coverage",
    ".wrangler", ".vinxi", ".nitro", "dataconnect",
}

IGNORED_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".zip",
    ".woff", ".woff2", ".ttf", ".eot", ".otf", ".mp4", ".webp",
    ".svg", ".lock", ".map", ".pyc", ".pyo",
}

MAX_FILE_BYTES = 150_000


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

def _rough_token_count(text: str) -> int:
    return max(1, len(text) // 4)


def chunk_text(text: str) -> list[str]:
    """Split *text* into overlapping chunks aligned to newlines."""
    lines = text.splitlines(keepends=True)
    chunks: list[str] = []
    current: list[str] = []
    current_tokens = 0

    for line in lines:
        lt = _rough_token_count(line)
        if current_tokens + lt > CHUNK_TOKENS and current:
            chunks.append("".join(current))
            # keep overlap
            overlap: list[str] = []
            ot = 0
            for prev in reversed(current):
                pt = _rough_token_count(prev)
                if ot + pt > CHUNK_OVERLAP:
                    break
                overlap.insert(0, prev)
                ot += pt
            current = overlap
            current_tokens = ot
        current.append(line)
        current_tokens += lt

    if current:
        chunks.append("".join(current))

    return [c for c in chunks if c.strip()]


# ---------------------------------------------------------------------------
# File collection
# ---------------------------------------------------------------------------

def collect_files(repo_path: str) -> list[dict]:
    files: list[dict] = []
    skipped = 0

    for root, dirs, filenames in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]
        for filename in filenames:
            ext = os.path.splitext(filename)[1].lower()
            if ext in IGNORED_EXTENSIONS:
                skipped += 1
                continue
            abs_path = os.path.join(root, filename)
            try:
                if os.path.getsize(abs_path) > MAX_FILE_BYTES:
                    skipped += 1
                    continue
                with open(abs_path, "r", encoding="utf-8", errors="ignore") as fh:
                    content = fh.read()
            except OSError:
                skipped += 1
                continue
            rel_path = os.path.relpath(abs_path, repo_path).replace("\\", "/")
            files.append({"path": rel_path, "content": content})

    print(f"  ✔ Collected {len(files)} file(s)  |  skipped {skipped}")
    return files


# ---------------------------------------------------------------------------
# Gemini REST embedding (v1 stable API — no SDK)
# ---------------------------------------------------------------------------

def embed_batch(texts: list[str]) -> list[list[float]]:
    """Call Gemini batchEmbedContents with automatic retry on 429 rate limits."""
    if not GEMINI_KEY:
        sys.exit("❌  GEMINI_API_KEY not set in backend/.env")

    requests_payload = [
        {
            "model": f"models/{EMBEDDING_MODEL}",
            "content": {"parts": [{"text": t}]},
            "taskType": "RETRIEVAL_DOCUMENT",
        }
        for t in texts
    ]

    for attempt in range(1, MAX_RETRIES + 1):
        response = httpx.post(
            GEMINI_EMBED_URL,
            params={"key": GEMINI_KEY},
            json={"requests": requests_payload},
            timeout=60,
        )

        if response.status_code == 200:
            return [item["values"] for item in response.json()["embeddings"]]

        if response.status_code == 429:
            wait = BATCH_DELAY * (2 ** attempt)   # exponential backoff: 6s, 12s, 24s …
            print(f"\n  ⏳  Rate limited. Waiting {wait:.0f}s before retry {attempt}/{MAX_RETRIES}…")
            time.sleep(wait)
            continue

        raise RuntimeError(
            f"Gemini API error {response.status_code}: {response.text[:300]}"
        )

    raise RuntimeError(f"Gemini API still rate-limiting after {MAX_RETRIES} retries.")


# ---------------------------------------------------------------------------
# MongoDB
# ---------------------------------------------------------------------------

def get_db():
    from pymongo import MongoClient
    client = MongoClient(MONGO_URL)
    return client.get_database("buglens")


# ---------------------------------------------------------------------------
# Core ingestion
# ---------------------------------------------------------------------------

def ingest(files: list[dict], repo_name: str) -> None:
    db = get_db()
    collection = db.code_chunks

    collection.create_index("repository_name")
    collection.create_index([("repository_name", 1), ("file_path", 1)])

    # --- Resume support: find file_paths already fully ingested ---------------
    done_paths = set(
        collection.distinct("file_path", {"repository_name": repo_name})
    )
    if done_paths:
        print(f"  ♻️   Resuming — {len(done_paths)} file(s) already ingested, skipping them.")

    # Build chunk documents for files NOT yet ingested
    all_docs: list[dict] = []
    for file_info in files:
        if file_info["path"] in done_paths:
            continue
        for idx, chunk in enumerate(chunk_text(file_info["content"])):
            all_docs.append({
                "repository_name": repo_name,
                "file_path": file_info["path"],
                "text": chunk,
                "chunk_index": idx,
                "token_count": _rough_token_count(chunk),
                "embedding_model": EMBEDDING_MODEL,
                "ingested_at": datetime.now(timezone.utc),
            })

    total = len(all_docs)
    if total == 0:
        print("  ✅  Nothing new to ingest — all files already in MongoDB.")
        return

    print(f"  ✔ {total} chunks remaining from {len(files) - len(done_paths)} file(s)")
    print(f"  Embedding with Gemini {EMBEDDING_MODEL} | batch={BATCH_SIZE} | delay={BATCH_DELAY}s\n")

    inserted = 0
    t0 = time.time()

    for start in range(0, total, BATCH_SIZE):
        batch = all_docs[start: start + BATCH_SIZE]
        texts = [doc["text"] for doc in batch]

        try:
            vectors = embed_batch(texts)
        except Exception as exc:
            print(f"\n  ❌  Batch {start}–{start + len(batch)} failed: {exc}")
            continue

        for doc, vec in zip(batch, vectors):
            doc["embedding"] = vec

        collection.insert_many(batch)
        inserted += len(batch)

        pct = int(inserted / total * 100)
        print(f"  [{pct:3d}%]  {inserted}/{total} chunks  ({time.time()-t0:.1f}s)", end="\r")

        # Polite delay between batches to respect free-tier rate limits
        if start + BATCH_SIZE < total:
            time.sleep(BATCH_DELAY)

    print(f"\n\n  ✅  Ingestion complete!")
    print(f"     Repo       : {repo_name}")
    print(f"     Chunks     : {inserted}/{total} inserted")
    print(f"     Model      : {EMBEDDING_MODEL} ({EMBEDDING_DIMS}d)")
    print(f"     Time       : {time.time()-t0:.1f}s")
    print(f"\n  Query '{repo_name}' via the Repository Q&A tab.\n")


# ---------------------------------------------------------------------------
# CLI helpers
# ---------------------------------------------------------------------------

def list_repos() -> None:
    db = get_db()
    repos = db.code_chunks.distinct("repository_name")
    if not repos:
        print("ℹ️   No repositories ingested yet.")
        return
    print(f"\n📚  Ingested repositories ({len(repos)}):")
    for name in sorted(repos):
        count = db.code_chunks.count_documents({"repository_name": name})
        print(f"    · {name}  ({count} chunks)")
    print()


def delete_repo(repo_name: str) -> None:
    db = get_db()
    result = db.code_chunks.delete_many({"repository_name": repo_name})
    print(f"🗑️   Deleted {result.deleted_count} chunks for repo '{repo_name}'.")


# ---------------------------------------------------------------------------
# Entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BugLens Gemini ingestion tool")
    parser.add_argument("--repo-name", default="", help="Logical repo name (default: directory basename)")
    parser.add_argument("--list",   action="store_true", help="List ingested repos and exit")
    parser.add_argument("--delete", metavar="REPO_NAME",  help="Delete all chunks for a repo and exit")
    args = parser.parse_args()

    if args.list:
        list_repos()
        sys.exit(0)

    if args.delete:
        delete_repo(args.delete)
        sys.exit(0)

    abs_repo = os.path.abspath(REPO_PATH)
    if not os.path.isdir(abs_repo):
        print(f"❌  REPO_PATH does not exist: {abs_repo}")
        sys.exit(1)

    effective_name = args.repo_name.strip() or REPO_NAME.strip() or os.path.basename(abs_repo)

    print(f"\n🔍  Scanning : {abs_repo}")
    print(f"    repo_name : {effective_name!r}")
    print(f"    model     : {EMBEDDING_MODEL} ({EMBEDDING_DIMS}d, Gemini v1 REST API)")

    files = collect_files(abs_repo)
    if not files:
        print("❌  No readable files found.")
        sys.exit(1)

    ingest(files, repo_name=effective_name)
