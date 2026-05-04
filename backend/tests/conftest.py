"""Shared test fixtures for TalentLens backend tests."""
import os
import tempfile
import pytest

# Force SQLite for all tests — must be set before any app imports
_test_db = os.path.join(tempfile.gettempdir(), "test_talentlens.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_test_db}"


@pytest.fixture(autouse=True)
def _reset_db():
    """Ensure a clean database for each test."""
    from talentlens.database import engine, Base
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session():
    """Provide a transactional DB session for tests."""
    from talentlens.database import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
