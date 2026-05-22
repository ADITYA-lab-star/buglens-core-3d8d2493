from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import firebase_admin.auth

security = HTTPBearer(auto_error=False)

def get_firebase_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )
    
    try:
        # Verify the Firebase ID token, allowing up to 10 seconds of clock skew
        decoded_token = firebase_admin.auth.verify_id_token(credentials.credentials, clock_skew_seconds=10)
        
        # Extract the requested fields
        uid = decoded_token.get("uid")
        email = decoded_token.get("email")
        
        # the sign-in provider is usually nested inside 'firebase.sign_in_provider'
        firebase_claims = decoded_token.get("firebase", {})
        sign_in_provider = firebase_claims.get("sign_in_provider")
        
        return {
            "uid": uid,
            "email": email,
            "firebase": {
                "sign_in_provider": sign_in_provider
            },
            # also return the full payload in case we need other claims
            "payload": decoded_token
        }
    except firebase_admin.auth.InvalidIdTokenError as e:
        import logging
        logging.getLogger(__name__).error(f"InvalidIdTokenError: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )
    except firebase_admin.auth.ExpiredIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication error: {str(e)}",
        )
