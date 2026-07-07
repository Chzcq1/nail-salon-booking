"""
Vercel Serverless Function entry point.

Vercel routes /api/* and /webhook* traffic here.
The FastAPI app handles all routing internally.
"""
import sys
import os

# Add project root to Python path so `backend` package is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.main import app  # noqa: F401 — Vercel detects the ASGI `app` object
