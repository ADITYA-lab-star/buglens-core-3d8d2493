import os, json
from dotenv import load_dotenv

load_dotenv()
val = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
if val:
    print("Value starts with:", val[:10])
    try:
        json.loads(val)
        print("Parse success")
    except Exception as e:
        print("Parse failed:", e)
else:
    print("No val")
