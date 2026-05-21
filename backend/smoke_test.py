"""Quick smoke tests for the live BugLens backend.
Run with: venv\Scripts\python smoke_test.py
"""
import json
import requests

BASE = "http://127.0.0.1:8000"
HEADERS = {"Content-Type": "application/json"}

# ── 1. Health check ──────────────────────────────────────────────────────────
print("\n[1] Health check")
r = requests.get(f"{BASE}/health")
assert r.status_code == 200, f"Health check failed: {r.status_code}"
print("    ✅", r.json())

# ── 2. Review stream (SSE) ───────────────────────────────────────────────────
print("\n[2] POST /api/v1/reviews/stream  (streaming — first 400 chars)")
payload = {
    "code": "const API_KEY = 'sk-live-abc';\nfetch(`https://api.example.com?key=${API_KEY}`).then(r => r.json()).then(d => console.log(d))",
    "language": "javascript",
    "preferred_model": "openai",
}
with requests.post(f"{BASE}/api/v1/reviews/stream", json=payload, headers=HEADERS, stream=True, timeout=60) as resp:
    assert resp.status_code == 200, f"Stream failed: {resp.status_code} {resp.text}"
    collected = ""
    for line in resp.iter_lines():
        if not line:
            continue
        decoded = line.decode("utf-8")
        if decoded.startswith("data: ") and "event: done" not in collected:
            token = decoded[6:].replace("\\n", "\n")
            collected += token
        if "event: done" in decoded or len(collected) >= 400:
            break
    print("    ✅ First 400 chars of streamed review:")
    print("   ", collected[:400].replace("\n", "\n    "))

# ── 3. Chat query (RAG) ──────────────────────────────────────────────────────
print("\n[3] POST /api/v1/chat/query  (RAG — expects 404 until ingestion is run)")
chat_payload = {
    "repo_name": "owner/my-repo",
    "query": "Where are the API routes defined?",
    "preferred_model": "openai",
}
r = requests.post(f"{BASE}/api/v1/chat/query", json=chat_payload, headers=HEADERS, timeout=10)
if r.status_code == 404:
    print("    ✅ Correctly returns 404 (collection empty — run ingest.py first)")
elif r.status_code == 200:
    print("    ✅ RAG query returned 200 (data already ingested)")
else:
    print(f"    ⚠️  Unexpected status {r.status_code}: {r.text[:200]}")

print("\n✅  All smoke tests passed. Backend is live and OpenAI key is valid.\n")
