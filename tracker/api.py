import calendar
import re
import sqlite3
import time
from datetime import date, timedelta
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response
from pydantic import BaseModel, Field, field_validator

from tracker.auth import (
    COOKIE, DEMO_SECONDS, SESSION_SECONDS, SessionCookie, check_password,
    current_user, limit_auth_attempts, password_hash, require_first_party, start_session, token_hash,
)
from tracker.metrics import dates, day_total, is_scheduled, matches_schedule, streaks, summary
from tracker.storage import connection


router = APIRouter(prefix="/api", dependencies=[Depends(require_first_party)])
User = Annotated[sqlite3.Row, Depends(current_user)]
DEFAULT_CATEGORIES = {
    "mind": "Развитие",
    "body": "Здоровье",
    "focus": "Фокус",
    "rest": "Отдых",
}
MIN_DAY = date(2000, 1, 1)
MAX_DAY = date(2100, 12, 31)
LocalDate = Annotated[date | None, Query(ge=MIN_DAY, le=MAX_DAY)]
CompletionDate = Annotated[date, Path(ge=MIN_DAY, le=MAX_DAY)]
SAMPLE_HABITS = [
    ("Read for 15 minutes", "mind"),
    ("Go for a walk", "body"),
    ("Изучить Fast API", "focus"),
]
DEMO_HABITS = [
    ("Читать 15 минут", "mind", 127),
    ("Выйти на прогулку", "body", 127),
    (SAMPLE_HABITS[2][0], "focus", 127),
    ("Убрать телефон перед сном", "rest", 127),
]


class Credentials(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        email = value.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            raise ValueError("Укажи email в формате name@example.com.")
        return email


Name = Annotated[str, Field(min_length=1, max_length=50)]


class Registration(Credentials):
    name: Name

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class Profile(BaseModel):
    id: int
    name: str
    email: str | None
    demo: bool


class ProfileUpdate(BaseModel):
    name: Name

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class HabitInput(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=80)]
    category: Annotated[str, Field(min_length=1, max_length=40)]
    weekdays: Annotated[set[Annotated[int, Field(ge=0, le=6)]], Field(min_length=1)]

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value

    def weekday_mask(self) -> int:
        return sum(1 << day for day in self.weekdays)


class Habit(BaseModel):
    id: int
    name: str
    category: str
    weekdays: list[int]
    start_date: date
    current_streak: int
    best_streak: int
    scheduled: bool
    can_mark: bool
    completed: bool


class Completion(BaseModel):
    completed: bool


class Totals(BaseModel):
    scheduled: int
    completed: int
    percent: int


class Activity(BaseModel):
    date: date
    scheduled: int
    completed: int


class CategoryInput(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=32)]

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return " ".join(value.split()) if isinstance(value, str) else value


class Category(CategoryInput):
    id: str


class Dashboard(BaseModel):
    today: date
    selected: date
    habits: list[Habit]
    categories: list[Category]
    week: Totals
    selected_week: Totals
    month: Totals
    activity: list[Activity]


def profile(user: sqlite3.Row) -> Profile:
    return Profile(id=user["id"], name=user["name"], email=user["email"], demo=user["email"] is None)


@router.post("/auth/register", status_code=201)
def register(payload: Registration, request: Request, response: Response) -> Profile:
    limit_auth_attempts(request, "register", 5)
    encoded = password_hash(payload.password)
    with connection() as db:
        try:
            user_id = db.execute(
                "INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (payload.email, payload.name, encoded, int(time.time())),
            ).lastrowid
        except sqlite3.IntegrityError as exc:
            raise HTTPException(409, "Этот email уже зарегистрирован.") from exc
        assert user_id is not None
        start_session(db, response, user_id, SESSION_SECONDS)
    return Profile(id=user_id, email=payload.email, name=payload.name, demo=False)


@router.post("/auth/login")
def login(payload: Credentials, request: Request, response: Response) -> Profile:
    limit_auth_attempts(request, "login", 8)
    with connection() as db:
        user = db.execute("SELECT * FROM users WHERE email = ?", (payload.email,)).fetchone()
        if not check_password(payload.password, user["password_hash"] if user else None):
            raise HTTPException(401, "Проверь email и пароль.")
        assert user is not None
        start_session(db, response, user["id"], SESSION_SECONDS)
        return profile(user)


@router.post("/auth/demo", status_code=201)
def demo(request: Request, response: Response, today: LocalDate = None) -> Profile:
    limit_auth_attempts(request, "demo", 12)
    today = today or date.today()
    start = today - timedelta(days=42)
    with connection() as db:
        user_id = db.execute(
            "INSERT INTO users (name, created_at) VALUES (?, ?)", ("Гость", int(time.time()))
        ).lastrowid
        assert user_id is not None
        for index, (name, category, weekdays) in enumerate(DEMO_HABITS):
            habit_id = db.execute(
                "INSERT INTO habits (user_id, name, category, weekdays, start_date) VALUES (?, ?, ?, ?, ?)",
                (user_id, name, category, weekdays, start.isoformat()),
            ).lastrowid
            marks = [
                (habit_id, day.isoformat()) for day in dates(start, today)
                if (day == today and index < 2)
                or (day < today and ((today - day).days + index * 2) % (index + 3) != 0)
            ]
            db.executemany("INSERT INTO completions VALUES (?, ?)", marks)
        start_session(db, response, user_id, DEMO_SECONDS)
    return Profile(id=user_id, email=None, name="Гость", demo=True)


@router.post("/auth/logout", status_code=204)
def logout(response: Response, habit_session: SessionCookie = None) -> None:
    if habit_session:
        with connection() as db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(habit_session),))
    response.delete_cookie(COOKIE)


@router.get("/me")
def me(user: User) -> Profile:
    return profile(user)


@router.patch("/me")
def update_profile(user: User, payload: ProfileUpdate) -> Profile:
    name = payload.name
    with connection() as db:
        db.execute("UPDATE users SET name = ? WHERE id = ?", (name, user["id"]))
    return profile(user).model_copy(update={"name": name})


def owned_habit(db: sqlite3.Connection, user_id: int, habit_id: int) -> sqlite3.Row:
    habit = db.execute("SELECT * FROM habits WHERE id = ? AND user_id = ?", (habit_id, user_id)).fetchone()
    if habit is None:
        raise HTTPException(404, "Привычка не найдена.")
    return habit


def categories_for(db: sqlite3.Connection, user_id: int) -> list[Category]:
    defaults = [Category(id=key, name=name) for key, name in DEFAULT_CATEGORIES.items()]
    custom = db.execute("SELECT id, name FROM categories WHERE user_id = ? ORDER BY rowid", (user_id,))
    return defaults + [Category(id=row["id"], name=row["name"]) for row in custom]


@router.get("/categories")
def list_categories(user: User) -> list[Category]:
    with connection() as db:
        return categories_for(db, user["id"])


@router.post("/categories", status_code=201)
def create_category(user: User, payload: CategoryInput) -> Category:
    key = payload.name.casefold()
    if key in {name.casefold() for name in DEFAULT_CATEGORIES.values()}:
        raise HTTPException(409, "Категория с таким названием уже есть.")
    category = Category(id=f"custom-{uuid4().hex}", name=payload.name)
    with connection() as db:
        result = db.execute(
            """INSERT INTO categories (id, user_id, name, name_key) VALUES (?, ?, ?, ?)
               ON CONFLICT (user_id, name_key) DO NOTHING""",
            (category.id, user["id"], category.name, key),
        )
        if not result.rowcount:
            raise HTTPException(409, "Категория с таким названием уже есть.")
    return category


def require_category(db: sqlite3.Connection, user_id: int, category_id: str) -> None:
    if category_id in DEFAULT_CATEGORIES:
        return
    if db.execute("SELECT 1 FROM categories WHERE id = ? AND user_id = ?", (category_id, user_id)).fetchone() is None:
        raise HTTPException(422, "Выбери категорию из своего списка.")


@router.post("/habits", status_code=201)
def create_habit(user: User, payload: HabitInput, today: LocalDate = None) -> dict[str, int]:
    with connection() as db:
        require_category(db, user["id"], payload.category)
        habit_id = db.execute(
            "INSERT INTO habits (user_id, name, category, weekdays, start_date) VALUES (?, ?, ?, ?, ?)",
            (user["id"], payload.name, payload.category, payload.weekday_mask(), (today or date.today()).isoformat()),
        ).lastrowid
        assert habit_id is not None
    return {"id": habit_id}


@router.put("/habits/{habit_id}", status_code=204)
def edit_habit(user: User, habit_id: int, payload: HabitInput) -> None:
    with connection() as db:
        require_category(db, user["id"], payload.category)
        result = db.execute(
            "UPDATE habits SET name = ?, category = ?, weekdays = ? WHERE id = ? AND user_id = ?",
            (payload.name, payload.category, payload.weekday_mask(), habit_id, user["id"]),
        )
        if not result.rowcount:
            raise HTTPException(404, "Привычка не найдена.")


@router.delete("/habits/{habit_id}", status_code=204)
def delete_habit(user: User, habit_id: int) -> None:
    with connection() as db:
        result = db.execute("DELETE FROM habits WHERE id = ? AND user_id = ?", (habit_id, user["id"]))
        if not result.rowcount:
            raise HTTPException(404, "Привычка не найдена.")


@router.put("/habits/{habit_id}/completions/{day}", status_code=204)
def set_completion(user: User, habit_id: int, day: CompletionDate, payload: Completion, today: LocalDate = None) -> None:
    today = today or date.today()
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        habit = owned_habit(db, user["id"], habit_id)
        if day > today:
            raise HTTPException(422, "Будущую дату отметить нельзя.")
        if not payload.completed:
            db.execute("DELETE FROM completions WHERE habit_id = ? AND completed_on = ?", (habit_id, day.isoformat()))
        elif matches_schedule(day, habit["weekdays"]):
            db.execute("INSERT OR IGNORE INTO completions VALUES (?, ?)", (habit_id, day.isoformat()))
        else:
            raise HTTPException(422, "На этот день привычка не запланирована.")


@router.get("/dashboard")
def dashboard(user: User, today: LocalDate = None, selected: LocalDate = None) -> Dashboard:
    today = today or date.today()
    selected = selected or today
    monday = today - timedelta(days=today.weekday())
    selected_monday = selected - timedelta(days=selected.weekday())
    month_start = selected.replace(day=1)
    month_end = selected.replace(day=calendar.monthrange(selected.year, selected.month)[1])
    with connection() as db:
        db.execute("BEGIN")
        categories = categories_for(db, user["id"])
        rows = db.execute("SELECT * FROM habits WHERE user_id = ? ORDER BY id", (user["id"],)).fetchall()
        marks: dict[int, set[date]] = {}
        for row in db.execute(
            """SELECT habit_id, completed_on FROM completions JOIN habits ON habits.id = habit_id
               WHERE habits.user_id = ? AND completed_on <= ?""",
            (user["id"], today.isoformat()),
        ):
            marks.setdefault(row["habit_id"], set()).add(date.fromisoformat(row["completed_on"]))
    histories = []
    habits = []
    for row in rows:
        start = date.fromisoformat(row["start_date"])
        weekdays = row["weekdays"]
        completed = marks.get(row["id"], set())
        tracking_start = min(start, min(completed, default=start))
        histories.append((tracking_start, weekdays, completed))
        current, best = streaks(tracking_start, today, weekdays, completed)
        habits.append(Habit(
            id=row["id"], name=row["name"], category=row["category"], start_date=start,
            weekdays=[day for day in range(7) if weekdays & (1 << day)],
            current_streak=current, best_streak=best,
            scheduled=is_scheduled(selected, tracking_start, weekdays) or selected in completed,
            can_mark=selected <= today and (matches_schedule(selected, weekdays) or selected in completed),
            completed=selected in completed,
        ))
    current_week = list(dates(monday, monday + timedelta(days=6)))
    selected_week = list(dates(selected_monday, selected_monday + timedelta(days=6)))
    month = list(dates(month_start, month_end))
    all_days = sorted(set(current_week + selected_week + month))
    activity = {day: day_total(day, today, histories) for day in all_days}

    def period_totals(period: list[date]) -> Totals:
        return Totals(**summary([activity[day] for day in period if day <= today]))

    return Dashboard(
        today=today, selected=selected, habits=habits, categories=categories,
        activity=[Activity(**day) for day in activity.values()],
        week=period_totals(current_week), selected_week=period_totals(selected_week), month=period_totals(month),
    )


@router.get("/habits")
def list_habits(user: User, today: LocalDate = None, selected: LocalDate = None) -> list[Habit]:
    return dashboard(user, today, selected).habits
