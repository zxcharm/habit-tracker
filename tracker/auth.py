import hashlib
import hmac
import os
import secrets
import sqlite3
import time
from ipaddress import ip_address
from threading import BoundedSemaphore
from typing import Annotated

from fastapi import Cookie, HTTPException, Request, Response

from tracker.storage import connection


COOKIE = "habit_session"
SESSION_SECONDS = 30 * 24 * 60 * 60
DEMO_SECONDS = 24 * 60 * 60
AUTH_WINDOW = 60
PASSWORD_HASH_SLOT = BoundedSemaphore(1)


async def require_first_party(request: Request) -> None:
    public_origin = os.environ.get("HABIT_PUBLIC_ORIGIN")
    if not public_origin or request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    origin = request.headers.get("origin")
    if (origin and origin != public_origin) or request.headers.get("sec-fetch-site") == "cross-site":
        raise HTTPException(403, "Открой приложение напрямую и повтори запрос.")


def limit_auth_attempts(request: Request, operation: str, limit: int) -> None:
    client = request.client.host if request.client else "unknown"
    if os.environ.get("HABIT_PYTHONANYWHERE") == "1":
        try:
            client = str(ip_address(request.headers.get("x-real-ip", "")))
        except ValueError:
            pass
    bucket = hashlib.sha256(f"{operation}:{client}".encode()).hexdigest()
    now = int(time.time())
    reset = now - now % AUTH_WINDOW + AUTH_WINDOW
    with connection() as db:
        db.execute("DELETE FROM auth_limits WHERE expires_at <= ?", (now,))
        result = db.execute(
            """INSERT INTO auth_limits (bucket, attempts, expires_at) VALUES (?, 1, ?)
               ON CONFLICT(bucket) DO UPDATE SET attempts = attempts + 1
               WHERE auth_limits.attempts < ?""",
            (bucket, reset, limit),
        )
    if not result.rowcount:
        raise HTTPException(429, "Слишком много запросов. Попробуй чуть позже.",
                            headers={"Retry-After": str(reset - now)})


def password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    if not PASSWORD_HASH_SLOT.acquire(blocking=False):
        raise HTTPException(503, "Попробуй повторить вход чуть позже.", headers={"Retry-After": "2"})
    try:
        key = hashlib.scrypt(password.encode(), salt=salt, n=2**17, r=8, p=1, maxmem=256 * 1024**2)
    finally:
        PASSWORD_HASH_SLOT.release()
    return f"{salt.hex()}:{key.hex()}"


def check_password(password: str, stored: str | None) -> bool:
    salt = bytes.fromhex(stored.split(":")[0]) if stored else bytes(16)
    candidate = password_hash(password, salt)
    return stored is not None and hmac.compare_digest(candidate, stored)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def start_session(db: sqlite3.Connection, response: Response, user_id: int, ttl: int) -> None:
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    db.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
    db.execute("DELETE FROM users WHERE email IS NULL AND created_at <= ?", (now - DEMO_SECONDS,))
    db.execute("INSERT INTO sessions VALUES (?, ?, ?)", (token_hash(token), user_id, now + ttl))
    response.set_cookie(
        COOKIE, token, max_age=ttl, httponly=True, samesite="lax",
        secure=os.environ.get("HABIT_SECURE_COOKIE") == "1",
    )


SessionCookie = Annotated[str | None, Cookie(alias=COOKIE)]


def current_user(habit_session: SessionCookie = None) -> sqlite3.Row:
    if habit_session:
        with connection() as db:
            user = db.execute(
                """SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
                   WHERE token_hash = ? AND expires_at > ?""",
                (token_hash(habit_session), int(time.time())),
            ).fetchone()
            if user is not None:
                return user
    raise HTTPException(401, "Войди в аккаунт или открой демо.")
