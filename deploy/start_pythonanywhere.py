import os
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 2 or "DOMAIN_SOCKET" not in os.environ:
        raise SystemExit("Pass the PythonAnywhere domain and run with its DOMAIN_SOCKET environment.")

    domain = sys.argv[1]
    app_dir = Path(__file__).resolve().parents[1]
    os.environ.update(
        HABIT_DB_PATH=str(Path.home() / "put-data" / "habits.sqlite3"),
        HABIT_NETWORK_DISK="1",
        HABIT_PYTHONANYWHERE="1",
        HABIT_PUBLIC_ORIGIN=f"https://{domain}",
        HABIT_SECURE_COOKIE="1",
    )
    os.execv(sys.executable, [
        sys.executable, "-m", "uvicorn", "--app-dir", str(app_dir),
        "--uds", os.environ["DOMAIN_SOCKET"], "--no-proxy-headers",
        "--limit-concurrency", "32", "main:app",
    ])


if __name__ == "__main__":
    main()
