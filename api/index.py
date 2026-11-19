import sys
import os

# Set up paths for Vercel Serverless Function
_current_dir = os.path.dirname(os.path.abspath(__file__))
_root_dir = os.path.dirname(_current_dir)
_backend_dir = os.path.join(_root_dir, "backend")

for p in [_root_dir, _backend_dir]:
    if p not in sys.path:
        sys.path.insert(0, p)

# Load environment variables
from dotenv import load_dotenv
for _env_path in [
    os.path.join(_root_dir, ".env"),
    os.path.join(_backend_dir, ".env")
]:
    if os.path.isfile(_env_path):
        load_dotenv(_env_path, override=False)

# Import the FastAPI application
from app.main import app
