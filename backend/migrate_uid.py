"""
BugLens — UID Migration Script
================================
Stamps every ``code_chunks`` document that is missing a ``uid`` field with a
specified Firebase user UID.

Use this (Option B) to preserve existing ingested data and make it visible to
one specific user (typically the admin who ran ``ingest_mongo.py``).

Usage
-----
    cd backend
    python migrate_uid.py --uid <YOUR_FIREBASE_UID>

    # Dry-run (shows count without modifying anything)
    python migrate_uid.py --uid <YOUR_FIREBASE_UID> --dry-run

How to find your Firebase UID
------------------------------
1. Go to the Firebase Console → Authentication → Users
2. Find your account row → copy the User UID column value
   (looks like: "abc123XYZexample")

   OR open your browser DevTools on the BugLens app, run:
       firebase.auth().currentUser.uid
   in the console while logged in.
"""

from __future__ import annotations

import argparse
import os
import sys

from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")


def migrate(uid: str, dry_run: bool = False) -> None:
    try:
        from pymongo import MongoClient
    except ImportError:
        sys.exit("❌  pymongo is not installed. Run: pip install pymongo")

    client = MongoClient(MONGO_URL)
    db = client.get_database("buglens")
    collection = db.code_chunks

    # Find documents without a uid field
    query = {"uid": {"$exists": False}}
    count = collection.count_documents(query)

    if count == 0:
        print("✅  All code_chunks documents already have a uid. Nothing to migrate.")
        return

    print(f"🔍  Found {count} document(s) without a uid field.")

    if dry_run:
        print("ℹ️   Dry-run mode — no changes made.")
        repos = collection.distinct("repository_name", query)
        print(f"     Affected repos: {repos}")
        return

    result = collection.update_many(query, {"$set": {"uid": uid}})

    print(f"\n✅  Migration complete!")
    print(f"     UID stamped   : {uid}")
    print(f"     Docs updated  : {result.modified_count}")
    repos = collection.distinct("repository_name", {"uid": uid})
    print(f"     Repos visible : {repos}")
    print(
        f"\n  These repositories are now visible only to the user with UID '{uid}'.\n"
        f"  Log in as that user and open the Repository Q&A tab to confirm.\n"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Stamp a Firebase uid onto existing code_chunks documents."
    )
    parser.add_argument(
        "--uid",
        required=True,
        help="Firebase UID to stamp on all un-scoped code_chunks (e.g. 'abc123XYZ')",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show how many documents would be updated without making changes.",
    )
    args = parser.parse_args()

    if len(args.uid) < 10:
        sys.exit("❌  That UID looks too short. Double-check your Firebase UID.")

    migrate(uid=args.uid, dry_run=args.dry_run)
