import os
import json
import firebase_admin
from firebase_admin import credentials
from dotenv import load_dotenv

def init_firebase():
    """Initializes the Firebase Admin SDK using the credentials from the environment."""
    if firebase_admin._apps:
        return firebase_admin.get_app()

    load_dotenv(override=True)
    service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    
    if service_account_json:
        try:
            cert_dict = json.loads(service_account_json)
            cred = credentials.Certificate(cert_dict)
            return firebase_admin.initialize_app(cred)
        except json.JSONDecodeError as e:
            print(f"WARNING: FIREBASE_SERVICE_ACCOUNT_JSON is not a valid JSON string. Error: {e}")
            return firebase_admin.initialize_app()
        except Exception as e:
            print(f"WARNING: Failed to initialize Firebase Admin SDK: {e}")
            return firebase_admin.initialize_app()
            
    print("WARNING: No FIREBASE_SERVICE_ACCOUNT_JSON found, using default app initialization. If this is not a GCP environment, auth will fail.")
    return firebase_admin.initialize_app()
