import unittest

from backend.logic import fallback_mission, parse_json_object, validate_feedback, validate_mission


class LogicTests(unittest.TestCase):
    def test_fallback_missions_are_arabic_and_safe(self):
        for mode in ("تشبيه", "استعارة", "وصف حسي"):
            mission = fallback_mission(mode)
            self.assertEqual(mission["mode"], mode)
            self.assertIn("من غير", mission["prompt"])

    def test_parse_json_with_markdown_fence(self):
        self.assertEqual(parse_json_object('```json\n{"prompt":"تأمل"}\n```'), {"prompt": "تأمل"})

    def test_mission_requires_arabic_text(self):
        with self.assertRaises(ValueError):
            validate_mission({"prompt": "Observe a tree", "question": "What did you notice?"}, "تشبيه")

    def test_mission_rejects_unsafe_action(self):
        with self.assertRaises(ValueError):
            validate_mission({"prompt": "تسلّق الشجرة ثم صغ تشبيهًا", "question": "ماذا رأيت؟"}, "تشبيه")

    def test_mission_rejects_closing_eyes(self):
        with self.assertRaises(ValueError):
            validate_mission({"prompt": "أغمض عينيك ثم صغ تشبيهًا", "question": "ما عبارتك؟"}, "تشبيه")

    def test_mission_must_match_selected_rhetoric(self):
        with self.assertRaises(ValueError):
            validate_mission({"prompt": "تأمل الهدوء", "question": "ما الشعور الذي راودك؟"}, "تشبيه")

    def test_valid_simile_mission_is_accepted(self):
        result = validate_mission(
            {"prompt": "راقب ظلًا ثم صغ تشبيهًا يبدأ بكأنّ.", "question": "ما العبارة التي كتبتها؟"},
            "تشبيه",
        )
        self.assertEqual(result["mode"], "تشبيه")

    def test_feedback_requires_all_arabic_fields(self):
        result = validate_feedback({"strength": "صورة جميلة", "suggestion": "أضف وصفًا", "rewrite": "الظل ستار"})
        self.assertEqual(result["strength"], "صورة جميلة")


if __name__ == "__main__":
    unittest.main()