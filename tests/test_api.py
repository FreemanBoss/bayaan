import unittest
from unittest.mock import AsyncMock, patch

import httpx

from backend.main import app


class ApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        )

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_mission_uses_validated_gemma_output(self):
        output = '{"prompt":"راقب لونًا ثم صغ تشبيهًا يبدأ بكأنّ.","question":"ما عبارتك؟"}'
        with patch("backend.main.ask_local_model", new=AsyncMock(return_value=output)):
            response = await self.client.post("/api/mission", json={"mode": "تشبيه"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["source"], "gemma3:4b")
        self.assertIn("تشبيه", response.json()["prompt"])

    async def test_mission_falls_back_on_invalid_model_content(self):
        output = '{"prompt":"أغمض عينيك ثم صغ تشبيهًا.","question":"ما عبارتك؟"}'
        with patch("backend.main.ask_local_model", new=AsyncMock(return_value=output)):
            response = await self.client.post("/api/mission", json={"mode": "تشبيه"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["source"], "offline-card")
        self.assertIn("شبّه", response.json()["prompt"])

    async def test_reflection_returns_short_arabic_feedback(self):
        output = '{"strength":"صورة موفقة.","suggestion":"أضف تفصيلًا حسيًا.","rewrite":"الضوء خيط ذهبي."}'
        with patch("backend.main.ask_local_model", new=AsyncMock(return_value=output)):
            response = await self.client.post(
                "/api/reflect",
                json={"mode": "تشبيه", "reflection": "كان الظل عباءة خضراء"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["source"], "gemma3:4b")

    async def test_translation_endpoint_is_removed(self):
        response = await self.client.post("/api/translate", json={"text": "الظل عباءة"})
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
