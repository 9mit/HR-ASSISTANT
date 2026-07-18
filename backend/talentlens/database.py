"""Database connection and session management."""
from pathlib import Path
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import NullPool, QueuePool
import logging

from .settings import settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


def _build_engine():
    """Build the SQLAlchemy engine with production-safe pooling and fallback rules."""
    db_url = settings.DATABASE_URL

    if db_url.startswith("postgresql"):
        try:
            pool_kwargs = {}
            if settings.DEBUG:
                # NullPool is fine for local reload workflows
                pool_kwargs["poolclass"] = NullPool
            else:
                pool_kwargs.update(
                    poolclass=QueuePool,
                    pool_size=5,
                    max_overflow=10,
                    pool_pre_ping=True,
                    pool_recycle=1800,
                )

            engine = create_engine(
                db_url,
                echo=settings.DEBUG,
                connect_args={"connect_timeout": 10},
                **pool_kwargs,
            )
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
                try:
                    conn.execute(text(
                        "SELECT table_name FROM information_schema.tables "
                        "WHERE table_schema = 'public' LIMIT 1"
                    ))
                except Exception as health_exc:
                    logger.warning(
                        "PostgreSQL health check failed (%s).",
                        health_exc,
                    )
                    engine.dispose()
                    raise health_exc
            logger.info("Connected to PostgreSQL: %s", db_url.split("@")[-1])
            return engine
        except Exception as exc:
            if not settings.DEBUG:
                # Production must not silently fall back to SQLite
                raise RuntimeError(
                    "PostgreSQL is required when DEBUG=false. "
                    f"Connection failed: {exc}"
                ) from exc
            logger.warning(
                "PostgreSQL not reachable or unhealthy (%s). Falling back to SQLite.",
                exc,
            )

    # SQLite — local/dev only
    if not settings.DEBUG and not db_url.startswith("sqlite"):
        raise RuntimeError(
            "Refusing to use SQLite when DEBUG=false. "
            "Set a reachable DATABASE_URL (postgresql://...) for production."
        )

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
    try:
        from . import models  # noqa: F401
        logger.info(f"Registered tables: {Base.metadata.tables.keys()}")
    except Exception as e:
        logger.error(f"Error importing models: {e}")

    Base.metadata.create_all(bind=engine)
    logger.info("Base.metadata.create_all called")

    try:
        inspector = inspect(engine)
        tables = inspector.get_table_names()

        if "candidates" in tables:
            columns = [c["name"] for c in inspector.get_columns("candidates")]
            if "raw_record" not in columns:
                logger.info("Migrating: Adding raw_record column to candidates table")
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE candidates ADD COLUMN raw_record JSON"))
    except Exception as e:
        logger.warning(f"Migration check skipped or failed: {e}")

    logger.info("Database initialized successfully")
