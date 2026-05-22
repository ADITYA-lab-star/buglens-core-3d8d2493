import os
from dotenv import load_dotenv
print('cwd', os.getcwd())
print('dotenv result:', load_dotenv())
print('keys', 'FIREBASE_SERVICE_ACCOUNT_JSON' in os.environ)
