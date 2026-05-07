"""Database connection and session management."""
from pathlib import Path
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import NullPool
import logging

from .settings import settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


def _build_engine():
    """Build the SQLAlchemy engine with automatic fallback to SQLite."""
    db_url = settings.DATABASE_URL

    # Try PostgreSQL first
    if db_url.startswith("postgresql"):
        try:
            engine = create_engine(
                db_url,
                echo=settings.DEBUG,
                poolclass=NullPool,
                connect_args={"connect_timeout": 10},
            )
            # Quick connectivity check
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Connected to PostgreSQL: %s", db_url.split("@")[-1])
            return engine
        except Exception as exc:
            logger.warning(
                "PostgreSQL not reachable (%s). Falling back to SQLite.", exc
            )

    # SQLite fallback
    sqlite_path = Path(__file__).resolve().parent.parent / "data" / "talentlens.db"
    sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    sqlite_url = f"sqlite:///{sqlite_path}"
    logger.info("Using SQLite database: %s", sqlite_path)
    return create_engine(
        sqlite_url,
        echo=settings.DEBUG,
        connect_args={"check_same_thread": False},
    )


engine = _build_engine()

# Create session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


def get_db():
    """Dependency for FastAPI to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables and run simple migrations."""
    logger.info("Initializing database...")
    # Ensure all models are imported so they are registered in Base.metadata
    try:
        from . import models
        logger.info(f"Registered tables: {Base.metadata.tables.keys()}")
    except Exception as e:
        logger.error(f"Error importing models: {e}")
        
    Base.metadata.create_all(bind=engine)
    logger.info("Base.metadata.create_all called")
    
    # Robust migration using SQLAlchemy Inspector
    try:
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        
        if "candidates" in tables:
            columns = [c["name"] for c in inspector.get_columns("candidates")]
            if "raw_record" not in columns:
                logger.info("Migrating: Adding raw_record column to candidates table")
                with engine.begin() as conn:
                    # SQLite JSON type maps to TEXT
                    conn.execute(text("ALTER TABLE candidates ADD COLUMN raw_record JSON"))
        
        # Also check for 'merged_duplicate_ids' which was added earlier
        # and 'notes' table just in case
    except Exception as e:
        logger.warning(f"Migration check skipped or failed: {e}")

    logger.info("Database initialized successfully")
