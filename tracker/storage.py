import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_limits (
    bucket TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_limits_expires ON auth_limits(expires_at);
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL,
    UNIQUE (user_id, name_key)
);
CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    weekdays INTEGER NOT NULL,
    start_date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS habits_user_id ON habits(user_id);
CREATE TABLE IF NOT EXISTS completions (
    habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    completed_on TEXT NOT NULL,
    PRIMARY KEY (habit_id, completed_on)
);
"""


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    default_path = Path(__file__).resolve().parents[1] / "data" / "habits.sqlite3"
    path = Path(os.environ.get("HABIT_DB_PATH", default_path))
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    try:
        with db:
            yield db
    finally:
        db.close()


def initialize() -> None:
    with connection() as db:
        journal_mode = "DELETE" if os.environ.get("HABIT_NETWORK_DISK") == "1" else "WAL"
        db.execute(f"PRAGMA journal_mode = {journal_mode}")
        db.executescript(SCHEMA)
