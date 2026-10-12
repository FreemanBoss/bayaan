import json
import re
from typing import Any


ARABIC_RE = re.compile(r"[\u0600-\u06ff]")
ALLOWED_MODES = {"تشبيه", "استعارة", "وصف حسي"}

FALLBACK_MISSIONS = {
    "تشبيه": "اختر شيئًا طبيعيًا تراه من مكانك. تأمله دقيقتين، ثم شبّه لونه أو شكله بشيء تعرفه، من غير أن تلمسه أو تقطفه.",
    "استعارة": "راقب حركة الضوء أو الظل حولك. تخيّل أن الضوء كائن حي، ثم اكتب جملة تمنحه فعلًا إنسانيًا، من غير أن تلمس شيئًا في المكان.",
    "وصف حسي": "قف في مكان آمن، وأصغِ دقيقة إلى الأصوات حولك. صف صوتًا واحدًا بثلاث كلمات عربية دقيقة، من غير تسجيل أو تصوير.",
}


def has_arabic(text: str) -> bool:
    return bool(ARABIC_RE.search(text))


def parse_json_object(raw: str) -> dict[str, Any]:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start < 0 or end < start:
        raise ValueError("Model response did not contain a JSON object")
    value = json.loads(cleaned[start : end + 1])
    if not isinstance(value, dict):
        raise ValueError("Model response must be a JSON object")
    return value


def validate_mission(value: dict[str, Any], mode: str) -> dict[str, str]:
    if mode not in ALLOWED_MODES:
        raise ValueError("Unsupported rhetoric mode")
    prompt = value.get("prompt")
    question = value.get("question")
    if not isinstance(prompt, str) or not isinstance(question, str):
        raise ValueError("Mission is missing Arabic prompt fields")
    prompt = prompt.strip()
    question = question.strip()
    if not (has_arabic(prompt) and has_arabic(question)):
        raise ValueError("Mission must be written in Arabic")
    if len(prompt) > 300 or len(question) > 180:
        raise ValueError("Mission text is too long")
    unsafe_action = re.search(
        r"\b(climb|touch|pick|eat|approach|cross|enter)\b|"
        r"(تسلّق|تسلق|المس|لامس|اقطف|قطف|اقترب|اعبر|ادخل|تناول|"
        r"أغمض\s+عينيك|أغمض\s+عينك|أغمضي\s+عينيك)",
        prompt,
        re.IGNORECASE,
    )
    if unsafe_action:
        raise ValueError("Mission contains an unsafe action")
    combined = f"{prompt} {question}"
    required_markers = {
        "تشبيه": ("شبّه", "تشبيه", "كأن", "مثل"),
        "استعارة": ("استعارة", "شخص", "كأن", "تخيّل", "تخيل"),
        "وصف حسي": ("صف", "وصف", "كلمات", "حواس"),
    }
    if not any(marker in combined for marker in required_markers[mode]):
        raise ValueError("Mission does not implement the selected Arabic rhetoric exercise")
    return {"prompt": prompt, "question": question, "mode": mode}


def fallback_mission(mode: str) -> dict[str, str]:
    selected = mode if mode in FALLBACK_MISSIONS else "تشبيه"
    return {
        "prompt": FALLBACK_MISSIONS[selected],
        "question": "ما الصورة البلاغية التي حضرت في ذهنك؟",
        "mode": selected,
    }


def validate_feedback(value: dict[str, Any]) -> dict[str, str]:
    fields = ("strength", "suggestion", "rewrite")
    result: dict[str, str] = {}
    for field in fields:
        text = value.get(field)
        if not isinstance(text, str) or not has_arabic(text.strip()):
            raise ValueError("Feedback must include short Arabic text")
        text = text.strip()
        if len(text) > 240:
            raise ValueError("Feedback field is too long")
        result[field] = text
    return result