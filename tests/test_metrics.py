import unittest
from datetime import date

from tracker.metrics import is_scheduled, streaks, summary


class MetricsTests(unittest.TestCase):
    def test_streak_skips_unscheduled_days_and_keeps_open_today(self):
        monday = date(2026, 11, 16)
        wednesday = date(2026, 11, 18)
        friday = date(2026, 11, 20)
        saturday = date(2026, 11, 21)
        weekdays = (1 << 0) | (1 << 2) | (1 << 4)
        self.assertFalse(is_scheduled(date(2026, 11, 17), monday, weekdays))
        self.assertEqual(streaks(monday, friday, weekdays, {monday, wednesday}), (2, 2))
        self.assertEqual(streaks(monday, saturday, weekdays, {monday, wednesday}), (0, 2))

    def test_summary_uses_total_scheduled_slots(self):
        days = [{"date": "2026-11-16", "scheduled": 4, "completed": 2},
                {"date": "2026-11-17", "scheduled": 1, "completed": 1}]
        self.assertEqual(summary(days), {"scheduled": 5, "completed": 3, "percent": 60})
        self.assertEqual(summary([])["percent"], 0)
