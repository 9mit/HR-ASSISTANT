"""Database connection and session management."""
from pathlib import Path
from sqlalchemy import create_engine, text
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
    """Initialize database tables."""
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables initialized")
