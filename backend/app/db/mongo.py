import os
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

class MongoDB:
    client: AsyncIOMotorClient = None
    db = None

mongo_db = MongoDB()

def connect_to_mongo():
    load_dotenv()
    mongo_url = os.environ.get("MONGODB_URL", "mongodb://localhost:27017")
    try:
        mongo_db.client = AsyncIOMotorClient(mongo_url)
        # We will use 'buglens' as the default database name
        mongo_db.db = mongo_db.client.get_database("buglens")
        logger.info("Connected to MongoDB.")
    except Exception as e:
        logger.error(f"Could not connect to MongoDB: {e}")
        raise e

def close_mongo_connection():
    if mongo_db.client:
        mongo_db.client.close()
        logger.info("Closed MongoDB connection.")

def get_mongo_db():
    """Dependency to inject the MongoDB database instance into routes."""
    if mongo_db.db is None:
        connect_to_mongo()
    return mongo_db.db
