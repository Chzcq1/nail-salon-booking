"""
Regression Test Fixtures — CSC (Chain System Care)
Sets environment variables BEFORE any backend imports.
"""

import os

# ── Must set these BEFORE importing any backend module ──────────────────────
_TEST_SECRET = "test-secret-key-minimum-32-characters-okay"
_TEST_SUPER_ADMIN_KEY = "test-super-admin-key-regression"

os.environ.setdefault("SECRET_KEY", _TEST_SECRET)
os.environ.setdefault("NAIL_SUPER_ADMIN_KEY", _TEST_SUPER_ADMIN_KEY)
# Leave DATABASE_URL unset so the lifespan skips real DB init

import hashlib
import datetime
from typing import Generator

import jwt as _jwt
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, AsyncMock

from backend.main import app
from backend.database import get_db, Base
from backend.auth import create_admin_token
from backend.models import (
    Shop,
    NailShopSettings,
    NailShopApiKeys,
    Customer,
    NailService,
    NailStaff,
    NailTimeSlot,
    NailBooking,
    TopupRequest,
    CreditTransaction,
    EmailOTPSession,
    ShopPlan,
    NailRenewalRequest,
)

# ── Constants ────────────────────────────────────────────────────────────────
TEST_SECRET = os.environ["SECRET_KEY"]
TEST_SUPER_ADMIN_KEY = os.environ["NAIL_SUPER_ADMIN_KEY"]
TEST_PASSCODE = "AdminPass99"
TEST_SHOP_SLUG = "testshop"
TEST_EMAIL = "customer@test.com"
TEST_PIN = "1234"


def _make_superadmin_jwt() -> str:
    """Create a valid superadmin session JWT (same as _issue_superadmin_session in nail.py)."""
    import time
    payload = {
        "sub": "superadmin",
        "iat": int(time.time()),
        "exp": int(time.time()) + 43200,  # 12 hours
    }
    return _jwt.encode(payload, TEST_SUPER_ADMIN_KEY, algorithm="HS256")


SUPER_ADMIN_JWT = _make_superadmin_jwt()
SUPER_ADMIN_HEADERS = {"x-super-admin-key": SUPER_ADMIN_JWT}

# ── SQLite in-memory test engine ─────────────────────────────────────────────
_test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
)

@event.listens_for(_test_engine, "connect")
def _set_fk_pragma(dbapi_conn, _):
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA foreign_keys=OFF")   # OFF: avoid FK cascade issues in tests
    cur.close()

_TestSession = sessionmaker(autocommit=False, autoflush=True, bind=_test_engine)


# ── Session-scoped table creation ─────────────────────────────────────────────
@pytest.fixture(scope="session", autouse=True)
def _create_tables():
    Base.metadata.create_all(bind=_test_engine)
    yield
    Base.metadata.drop_all(bind=_test_engine)


# ── Per-test DB session with rollback ─────────────────────────────────────────
@pytest.fixture()
def db() -> Generator[Session, None, None]:
    connection = _test_engine.connect()
    transaction = connection.begin()
    session = _TestSession(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


# ── FastAPI TestClient with DB override and mocked lifespan ──────────────────
@pytest.fixture()
def client(db: Session) -> Generator[TestClient, None, None]:
    def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db

    # Patch startup side-effects:
    # Setting backend.database.engine = None makes the lifespan skip
    # create_all / _run_migrations / _run_cleanup entirely.
    import backend.database as _db_module
    original_engine = _db_module.engine
    _db_module.engine = None

    # Patch _now() in nail.py to return naive UTC — SQLite stores naive datetimes,
    # and direct Python comparisons like `_now() > shop.expired_at` would fail with
    # "can't compare offset-naive and offset-aware datetimes" otherwise.
    import datetime as _dt
    try:
        with (
            patch("backend.routes.nail._now", side_effect=lambda: _dt.datetime.utcnow()),
            patch("backend.routes.nail._now_th", side_effect=lambda: _dt.datetime.utcnow()),
        ):
            with TestClient(app, raise_server_exceptions=False) as c:
                yield c
    finally:
        _db_module.engine = original_engine

    app.dependency_overrides.clear()


# ── Test shop fixture ─────────────────────────────────────────────────────────
@pytest.fixture()
def test_shop(db: Session) -> Shop:
    passcode_hash = hashlib.sha256(TEST_PASSCODE.encode()).hexdigest()
    shop = Shop(
        slug=TEST_SHOP_SLUG,
        name="Test Nail Shop",
        admin_passcode_hash=passcode_hash,
        is_active=True,
        auth_method="otp",
        totp_confirmed=False,
    )
    db.add(shop)
    db.flush()

    settings = NailShopSettings(
        shop_id=shop.id,
        shop_name="Test Nail Shop",
        expired_at=datetime.datetime.utcnow() + datetime.timedelta(days=365),
        is_active=True,
    )
    db.add(settings)
    db.flush()
    return shop


@pytest.fixture()
def test_shop_with_totp(db: Session) -> Shop:
    """Shop configured to use TOTP for admin login."""
    import pyotp
    passcode_hash = hashlib.sha256(TEST_PASSCODE.encode()).hexdigest()
    secret = pyotp.random_base32()
    shop = Shop(
        slug="totp-shop",
        name="TOTP Shop",
        admin_passcode_hash=passcode_hash,
        is_active=True,
        auth_method="totp",
        totp_secret=secret,
        totp_confirmed=True,
    )
    db.add(shop)
    db.flush()
    settings = NailShopSettings(
        shop_id=shop.id,
        shop_name="TOTP Shop",
        expired_at=datetime.datetime.utcnow() + datetime.timedelta(days=365),
        is_active=True,
    )
    db.add(settings)
    db.flush()
    return shop


# ── Admin token for nail shop ─────────────────────────────────────────────────
@pytest.fixture()
def nail_admin_token(test_shop: Shop) -> str:
    return create_admin_token(telegram_id=999, shop_id=test_shop.id)


@pytest.fixture()
def nail_admin_headers(nail_admin_token: str) -> dict:
    return {"Authorization": f"Bearer {nail_admin_token}"}


# ── Test customer + wallet token ──────────────────────────────────────────────
@pytest.fixture()
def test_customer(db: Session, test_shop: Shop) -> Customer:
    import bcrypt
    pin_hash = bcrypt.hashpw(TEST_PIN.encode(), bcrypt.gensalt()).decode()
    customer = Customer(
        email=TEST_EMAIL,
        shop_id=test_shop.id,
        display_name="Test Customer",
        balance=500.00,
        pin_hash=pin_hash,
    )
    db.add(customer)
    db.flush()
    return customer


@pytest.fixture()
def wallet_token(test_customer: Customer, test_shop: Shop) -> str:
    payload = {
        "email": test_customer.email,
        "shop_id": test_shop.id,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7),
    }
    return _jwt.encode(payload, TEST_SECRET, algorithm="HS256")


@pytest.fixture()
def wallet_headers(wallet_token: str) -> dict:
    return {"Authorization": f"Bearer {wallet_token}"}


# ── Test nail service + staff + time slot ─────────────────────────────────────
@pytest.fixture()
def test_service(db: Session, test_shop: Shop) -> NailService:
    svc = NailService(
        shop_id=test_shop.id,
        name="Basic Manicure",
        duration_minutes=60,
        price=300.0,
        deposit_amount=100.0,
        is_active=True,
    )
    db.add(svc)
    db.flush()
    return svc


@pytest.fixture()
def test_staff(db: Session, test_shop: Shop) -> NailStaff:
    staff = NailStaff(
        shop_id=test_shop.id,
        name="Staff A",
        is_active=True,
    )
    db.add(staff)
    db.flush()
    return staff


@pytest.fixture()
def test_slot(db: Session, test_shop: Shop, test_staff: NailStaff) -> NailTimeSlot:
    # slot_date stored as string (YYYY-MM-DD) so nail.py string comparison works in SQLite
    tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    slot = NailTimeSlot(
        shop_id=test_shop.id,
        slot_date=tomorrow,
        start_time="10:00",
        end_time="11:00",
        max_bookings=3,
        is_available=True,
        staff_id=test_staff.id,
    )
    db.add(slot)
    db.flush()
    return slot


# ── Plan fixture for renewal ──────────────────────────────────────────────────
@pytest.fixture()
def test_plan(db: Session) -> ShopPlan:
    plan = ShopPlan(
        name="Standard",
        description="Standard plan",
        price=990.0,
        is_active=True,
        total_slots=10,
        registered_count=0,
    )
    db.add(plan)
    db.flush()
    return plan


# ── Helpers ───────────────────────────────────────────────────────────────────
def make_wallet_token(email: str, shop_id: int) -> str:
    payload = {
        "email": email,
        "shop_id": shop_id,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7),
    }
    return _jwt.encode(payload, TEST_SECRET, algorithm="HS256")


def make_verified_token(email: str, shop_id: int) -> str:
    """Simulates the verified_token returned after OTP verification.
    Must use 'purpose': 'otp_verified' — matches wallet.py wallet_verify_otp().
    """
    payload = {
        "email": email,
        "shop_id": shop_id,
        "purpose": "otp_verified",   # wallet.py checks payload.get("purpose") != "otp_verified"
        "exp": datetime.datetime.utcnow() + datetime.timedelta(minutes=15),
    }
    return _jwt.encode(payload, TEST_SECRET, algorithm="HS256")
