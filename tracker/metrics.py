from datetime import date, timedelta
from collections.abc import Iterator
from typing import TypedDict


class DayTotal(TypedDict):
    date: str
    scheduled: int
    completed: int


def dates(start: date, end: date) -> Iterator[date]:
    for offset in range((end - start).days + 1):
        yield start + timedelta(days=offset)


def matches_schedule(day: date, weekdays: int) -> bool:
    return bool(weekdays & (1 << day.weekday()))


def is_scheduled(day: date, start: date, weekdays: int) -> bool:
    return day >= start and matches_schedule(day, weekdays)


def streaks(start: date, today: date, weekdays: int, completed: set[date]) -> tuple[int, int]:
    current = best = 0
    for day in dates(start, today):
        if day in completed:
            current += 1
            best = max(current, best)
        elif day != today and is_scheduled(day, start, weekdays):
            current = 0
    return current, best


def day_total(
    day: date, today: date, habits: list[tuple[date, int, set[date]]]
) -> DayTotal:
    completed = 0
    scheduled = 0
    for start, weekdays, marks in habits:
        marked = day <= today and day in marks
        completed += marked
        scheduled += marked or is_scheduled(day, start, weekdays)
    return {"date": day.isoformat(), "scheduled": scheduled, "completed": completed}


def summary(days: list[DayTotal]) -> dict[str, int]:
    scheduled = sum(day["scheduled"] for day in days)
    completed = sum(day["completed"] for day in days)
    return {
        "scheduled": scheduled,
        "completed": completed,
        "percent": round(completed * 100 / scheduled) if scheduled else 0,
    }
