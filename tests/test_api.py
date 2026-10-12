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

    async def test_reflection_can_return_selected_english(self):
        output = '{"strength":"Strong image.","suggestion":"Add a sensory detail.","rewrite":"Shade became a green cloak."}'
        with patch("backend.main.ask_local_model", new=AsyncMock(return_value=output)):
            response = await self.client.post(
                "/api/reflect",
                json={"mode": "تشبيه", "reflection": "Shade was a cloak", "language": "en"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["strength"], "Strong image.")

    async def test_translation_supports_both_directions(self):
        for target, source, expected in (
            ("en", "الظل عباءة", "Shade is a cloak."),
            ("ar", "Shade is a cloak", "الظل عباءة"),
        ):
            output = '{"translation":"' + expected + '"}'
            with patch("backend.main.ask_local_model", new=AsyncMock(return_value=output)):
                response = await self.client.post("/api/translate", json={"text": source, "target": target})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["translation"], expected)

    async def test_chat_returns_response_in_requested_language(self):
        output = '{"reply":"Try shaping that observation as a simile."}'
        with patch("backend.main.ask_local_model", new=AsyncMock(return_value=output)):
            response = await self.client.post(
                "/api/chat",
                json={"message": "How can I write a simile?", "language": "en", "history": []},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["reply"], "Try shaping that observation as a simile.")

    async def test_speech_route_explains_unconfigured_local_voice(self):
        with patch("backend.main.PIPER_AR_VOICE", ""):
            response = await self.client.post("/api/speech", json={"text": "مرحبًا", "language": "ar"})
        self.assertEqual(response.status_code, 503)

    async def test_speech_route_returns_wav_audio(self):
        with patch("backend.main.PIPER_AR_VOICE", "/local/voice.onnx"), patch(
            "backend.main._synthesize_arabic_wav", return_value=b"RIFF-test-wave"
        ):
            response = await self.client.post("/api/speech", json={"text": "مرحبًا", "language": "ar"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "audio/wav")
        self.assertTrue(response.content.startswith(b"RIFF"))


if __name__ == "__main__":
    unittest.main()
