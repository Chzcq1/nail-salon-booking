import logging
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

Base = declarative_base()

# NEON_DATABASE_URL is a Replit-dev-only override so we can point this local
# environment at the same Neon database Render uses, without touching the
# production DATABASE_URL wiring (which Render sets directly).
_resolved_database_url = settings.database_url or os.environ.get("NEON_DATABASE_URL")

if _resolved_database_url:
    engine = create_engine(
        _resolved_database_url,
        pool_pre_ping=True,
        pool_recycle=300,
        connect_args={"connect_timeout": 30},  # ให้ Neon มีเวลา wake up (cold start)
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
else:
    logger.warning("DATABASE_URL is not set — database features will be unavailable")
    engine = None
    SessionLocal = None


def get_db():
    if not SessionLocal:
        raise RuntimeError("DATABASE_URL is not configured. Set the DATABASE_URL environment variable.")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
