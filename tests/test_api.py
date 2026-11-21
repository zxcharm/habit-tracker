import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

from main import app
from tracker.storage import connection, initialize


TODAY = "2026-11-18"
HABIT = {"name": "Учить Python", "category": "focus", "weekdays": [0, 2, 4]}


class ApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        self.enterContext(patch.dict(os.environ, {"HABIT_DB_PATH": str(Path(directory) / "test.sqlite3")}))
        initialize()
        self.client = await self.enterAsyncContext(self.new_client())

    def new_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")

    async def register(self, client: httpx.AsyncClient, email: str) -> dict:
        response = await client.post("/api/auth/register", json={
            "name": "Тест", "email": email, "password": "test-password",
        })
        self.assertEqual(response.status_code, 201, response.text)
        self.assertIn("httponly", response.headers["set-cookie"].lower())
        return response.json()

    async def test_public_routes(self):
        response = await self.client.get("/health")
        self.assertEqual(response.json(), {"status": "ok"})
        self.assertIn("/api/dashboard", (await self.client.get("/openapi.json")).json()["paths"])
        self.assertEqual((await self.client.get("/api/habits")).status_code, 401)

    async def test_progress_survives_database_reopen_and_new_login(self):
        email = "saved@example.com"
        with patch.dict(os.environ, {"HABIT_NETWORK_DISK": "1"}):
            initialize()
            with connection() as db:
                self.assertEqual(db.execute("PRAGMA journal_mode").fetchone()[0], "delete")
            await self.register(self.client, email)
            created = await self.client.post("/api/habits", params={"today": TODAY}, json=HABIT)
            self.assertEqual(created.status_code, 201, created.text)
            habit_id = created.json()["id"]
            marked = await self.client.put(f"/api/habits/{habit_id}/completions/{TODAY}",
                                           params={"today": TODAY}, json={"completed": True})
            self.assertEqual(marked.status_code, 204, marked.text)
            await self.client.post("/api/auth/logout")
            initialize()
            async with self.new_client() as returning:
                login = await returning.post("/api/auth/login", json={"email": email, "password": "test-password"})
                self.assertEqual(login.status_code, 200, login.text)
                dashboard = (await returning.get("/api/dashboard", params={"today": TODAY})).json()
                self.assertEqual(dashboard["habits"][0]["id"], habit_id)
                self.assertTrue(dashboard["habits"][0]["completed"])

    async def test_public_origin_secure_cookie_and_login_limit(self):
        origin = "https://put.example.com"
        with patch.dict(os.environ, {"HABIT_PUBLIC_ORIGIN": origin, "HABIT_SECURE_COOKIE": "1"}):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=origin) as public:
                rejected = await public.post("/api/auth/demo", headers={"origin": "https://another.example.com"})
                self.assertEqual(rejected.status_code, 403)
                demo = await public.post("/api/auth/demo", headers={"origin": origin})
                self.assertEqual(demo.status_code, 201, demo.text)
                self.assertIn("; secure", demo.headers["set-cookie"].lower())
                self.assertIn("strict-transport-security", demo.headers)
                self.assertEqual((await public.get("/api/me")).status_code, 200)
                redirect = await public.get("http://put.example.com/health?check=1")
                self.assertEqual(redirect.headers["location"], origin + "/health?check=1")
                with patch.dict(os.environ, {"HABIT_PYTHONANYWHERE": "1"}):
                    proxied = await public.get("/health", headers={"x-forwarded-proto": "http"})
                    self.assertEqual(proxied.status_code, 200)
                    self.assertEqual(proxied.json(), {"status": "ok"})

                with patch("tracker.api.check_password", return_value=False), patch("tracker.auth.time.time", return_value=1_800_000_005):
                    credentials = {"email": "saved@example.com", "password": "wrong-password"}
                    for _ in range(8):
                        attempt = await public.post("/api/auth/login", json=credentials, headers={"origin": origin})
                        self.assertEqual(attempt.status_code, 401, attempt.text)
                    limited = await public.post("/api/auth/login", json=credentials, headers={"origin": origin})
                    self.assertEqual(limited.status_code, 429)
                    self.assertEqual(limited.headers["retry-after"], "55")

    async def test_account_registration_login_and_profile(self):
        created = await self.register(self.client, "test@example.com")
        duplicate = await self.client.post("/api/auth/register", json={
            "name": "Дубликат", "email": "TEST@example.com", "password": "test-password",
        })
        self.assertEqual(duplicate.status_code, 409)
        changed = await self.client.patch("/api/me", json={"name": "Новое имя"})
        self.assertEqual(changed.json()["name"], "Новое имя")
        self.assertEqual((await self.client.post("/api/auth/logout")).status_code, 204)
        self.assertEqual((await self.client.get("/api/me")).status_code, 401)
        bad_login = await self.client.post("/api/auth/login", json={
            "email": "test@example.com", "password": "invalid-password",
        })
        self.assertEqual(bad_login.status_code, 401)
        login = await self.client.post("/api/auth/login", json={
            "email": "test@example.com", "password": "test-password",
        })
        self.assertEqual(login.status_code, 200, login.text)
        self.assertEqual(login.json()["id"], created["id"])
        self.assertEqual(login.json()["name"], "Новое имя")

    async def test_habit_lifecycle_and_account_isolation(self):
        await self.register(self.client, "owner@example.com")
        created = await self.client.post("/api/habits", params={"today": TODAY}, json=HABIT)
        self.assertEqual(created.status_code, 201, created.text)
        path = f"/api/habits/{created.json()['id']}"

        async with self.new_client() as visitor:
            await self.register(visitor, "other@example.com")
            self.assertEqual((await visitor.get("/api/habits")).json(), [])
            self.assertEqual((await visitor.delete(path)).status_code, 404)

        mark = f"{path}/completions/{TODAY}"
        for _ in range(2):
            response = await self.client.put(mark, params={"today": TODAY}, json={"completed": True})
            self.assertEqual(response.status_code, 204, response.text)
        dashboard = (await self.client.get("/api/dashboard", params={"today": TODAY})).json()
        self.assertEqual(dashboard["week"], {"completed": 1, "scheduled": 1, "percent": 100})
        self.assertEqual(dashboard["habits"][0]["current_streak"], 1)
        future = await self.client.put(f"{path}/completions/2026-11-20", params={"today": TODAY}, json={"completed": True})
        self.assertEqual(future.status_code, 422)
        self.assertEqual((await self.client.put(mark, params={"today": TODAY}, json={"completed": False})).status_code, 204)
        edit = await self.client.put(path, json={**HABIT, "name": "Повторить SQL", "weekdays": [0]})
        self.assertEqual(edit.status_code, 204)
        today_habit = (await self.client.get("/api/habits", params={"today": TODAY})).json()[0]
        self.assertEqual(today_habit["name"], "Повторить SQL")
        self.assertFalse(today_habit["scheduled"])
        self.assertEqual((await self.client.put(mark, params={"today": TODAY}, json={"completed": True})).status_code, 422)
        self.assertEqual((await self.client.delete(path)).status_code, 204)
        self.assertEqual((await self.client.get("/api/habits")).json(), [])

    async def test_demo_is_seeded_and_independent(self):
        response = await self.client.post("/api/auth/demo", params={"today": TODAY})
        self.assertEqual(response.status_code, 201, response.text)
        self.assertTrue(response.json()["demo"])
        dashboard = (await self.client.get("/api/dashboard", params={"today": TODAY})).json()
        self.assertEqual(len(dashboard["habits"]), 4)
        self.assertEqual(sum(habit["completed"] for habit in dashboard["habits"]), 2)
        self.assertTrue(any(habit["name"] == "Изучить Fast API" for habit in dashboard["habits"]))
        async with self.new_client() as other:
            await other.post("/api/auth/demo", params={"today": TODAY})
            habits = (await other.get("/api/habits", params={"today": TODAY})).json()
            self.assertNotEqual(habits[0]["id"], dashboard["habits"][0]["id"])

    async def test_completion_before_creation_updates_history(self):
        await self.register(self.client, "history@example.com")
        today = "2026-11-20"
        earlier = "2026-11-16"
        created = await self.client.post("/api/habits", params={"today": today}, json=HABIT)
        self.assertEqual(created.status_code, 201, created.text)
        path = f"/api/habits/{created.json()['id']}/completions/"

        async def dashboard() -> dict:
            response = await self.client.get("/api/dashboard", params={"today": today, "selected": earlier})
            self.assertEqual(response.status_code, 200, response.text)
            return response.json()

        before = await dashboard()
        self.assertTrue(before["habits"][0]["can_mark"])
        self.assertFalse(before["habits"][0]["scheduled"])
        self.assertEqual(before["week"]["scheduled"], 1)

        for day in (earlier, "2026-11-18"):
            mark = await self.client.put(path + day, params={"today": today}, json={"completed": True})
            self.assertEqual(mark.status_code, 204, mark.text)
        skipped = await self.client.put(path + "2026-11-17", params={"today": today}, json={"completed": True})
        self.assertEqual(skipped.status_code, 422)

        after = await dashboard()
        self.assertEqual(after["habits"][0]["start_date"], today)
        self.assertTrue(after["habits"][0]["completed"])
        self.assertEqual(after["habits"][0]["current_streak"], 2)
        self.assertEqual(after["week"], {"scheduled": 3, "completed": 2, "percent": 67})
        self.assertIn({"date": earlier, "scheduled": 1, "completed": 1}, after["activity"])

        removed = await self.client.put(path + earlier, params={"today": today}, json={"completed": False})
        self.assertEqual(removed.status_code, 204, removed.text)
        self.assertEqual((await dashboard())["week"], {"scheduled": 2, "completed": 1, "percent": 50})

    async def test_custom_categories_are_saved_and_account_scoped(self):
        await self.register(self.client, "category@example.com")
        created = await self.client.post("/api/categories", json={"name": "  Свои   проекты  "})
        self.assertEqual(created.status_code, 201, created.text)
        category = created.json()
        self.assertEqual(category["name"], "Свои проекты")
        for name in ("СВОИ ПРОЕКТЫ", "Фокус"):
            duplicate = await self.client.post("/api/categories", json={"name": name})
            self.assertEqual(duplicate.status_code, 409, duplicate.text)

        habit = await self.client.post("/api/habits", json={**HABIT, "category": category["id"]})
        self.assertEqual(habit.status_code, 201, habit.text)
        dashboard = (await self.client.get("/api/dashboard")).json()
        self.assertIn(category, dashboard["categories"])
        self.assertEqual(dashboard["habits"][0]["category"], category["id"])
        edit = await self.client.put(f"/api/habits/{habit.json()['id']}", json=HABIT)
        self.assertEqual(edit.status_code, 204, edit.text)

        async with self.new_client() as other:
            await self.register(other, "category-other@example.com")
            self.assertNotIn(category, (await other.get("/api/categories")).json())
            rejected = await other.post("/api/habits", json={**HABIT, "category": category["id"]})
            self.assertEqual(rejected.status_code, 422, rejected.text)

    async def test_selected_week_can_cross_month_boundary(self):
        await self.register(self.client, "week@example.com")
        today = "2026-02-10"
        habit = await self.client.post("/api/habits", params={"today": "2026-01-26"}, json={
            **HABIT, "weekdays": list(range(7)),
        })
        self.assertEqual(habit.status_code, 201, habit.text)
        marked = await self.client.put(f"/api/habits/{habit.json()['id']}/completions/2026-02-01",
                                       params={"today": today}, json={"completed": True})
        self.assertEqual(marked.status_code, 204, marked.text)

        response = await self.client.get("/api/dashboard", params={"today": today, "selected": "2026-01-30"})
        self.assertEqual(response.status_code, 200, response.text)
        dashboard = response.json()
        self.assertEqual(dashboard["selected_week"], {"scheduled": 7, "completed": 1, "percent": 14})
        self.assertEqual(dashboard["week"], {"scheduled": 2, "completed": 0, "percent": 0})
        self.assertEqual(dashboard["month"], {"scheduled": 6, "completed": 0, "percent": 0})
        self.assertIn({"date": "2026-02-01", "scheduled": 1, "completed": 1}, dashboard["activity"])

        current = await self.client.get("/api/dashboard", params={"today": today})
        self.assertEqual(current.json()["selected_week"], current.json()["week"])
