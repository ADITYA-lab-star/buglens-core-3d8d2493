from app.core.firebase import init_firebase
init_firebase()
import firebase_admin
app = firebase_admin.get_app()
print("Firebase Project ID:", app.project_id)
