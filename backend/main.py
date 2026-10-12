import io
import os
import wave
from pathlib import Path
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from backend.logic import (
    ALLOWED_MODES,
    fallback_mission,
    parse_json_object,
    validate_feedback,
    validate_mission,
)

ROOT = os.path.dirname(os.path.dirname(__file__))
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
MODEL_NAME = os.getenv("OLLAMA_MODEL", "gemma3:4b")
PIPER_AR_VOICE = os.getenv("PIPER_AR_VOICE", "")
_piper_voice = None
_piper_voice_path = ""

app = FastAPI(title="بَيَان | Bayān Walk", description="لعبة بلاغية عربية للمشي والتأمل")
app.mount("/static", StaticFiles(directory=os.path.join(ROOT, "web")), name="static")


class MissionRequest(BaseModel):
    mode: Literal["تشبيه", "استعارة", "وصف حسي"] = "تشبيه"
    place: str = Field(default="مكان آمن في الخارج", max_length=80)


class ReflectionRequest(BaseModel):
    mode: Literal["تشبيه", "استعارة", "وصف حسي"]
    reflection: str = Field(min_length=2, max_length=500)
    language: Literal["ar", "en"] = "ar"


class TranslationRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    target: Literal["ar", "en"]


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1200)
    language: Literal["ar", "en"] = "ar"
    history: list[ChatTurn] = Field(default_factory=list, max_length=8)


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1200)
    language: Literal["ar"] = "ar"


async def ask_local_model(prompt: str, temperature: float = 0.4) -> str:
    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                "format": "json",
                "options": {"temperature": temperature},
            },
        )
        response.raise_for_status()
        return response.json().get("response", "")


@app.get("/")
async def home():
    return FileResponse(os.path.join(ROOT, "web", "index.html"))


@app.get("/api/health")
async def health():
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            response = await client.get(f"{OLLAMA_URL}/api/tags")
            response.raise_for_status()
        names = {item.get("name") for item in response.json().get("models", [])}
        return {"ok": True, "model": MODEL_NAME, "model_available": MODEL_NAME in names}
    except (httpx.HTTPError, ValueError):
        return {"ok": False, "model": MODEL_NAME, "model_available": False}


@app.post("/api/mission")
async def mission(request: MissionRequest):
    if request.mode not in ALLOWED_MODES:
        request.mode = "تشبيه"
    examples = {
        "تشبيه": "راقب لونًا أو شكلًا تراه من مكانك الآمن، ثم صغ تشبيهًا عربيًا يبدأ بـ(كأنّ) أو (مثل).",
        "استعارة": "راقب الضوء أو الظل من مكانك الآمن، ثم صغ استعارة عربية تمنح ما رأيته فعلًا إنسانيًا.",
        "وصف حسي": "أصغِ إلى صوت أو لاحظ لونًا من مكانك الآمن، ثم صفه بثلاث كلمات عربية حسية دقيقة.",
    }
    prompt = (
        "أنت معلّم بلاغة عربية. أخرج JSON فقط بمفتاحين: prompt و question. "
        "اكتب بالعربية الفصحى جملة قصيرة واحدة للمهمة وسؤالًا واحدًا عن العبارة التي سيكتبها المتعلم بعد عودته. "
        "المهمة يجب أن تطلب تأملًا خارجيًا آمنًا ثم إنتاج الصورة البلاغية المختارة، لا مجرد وصف المشاعر. "
        "لا تطلب إغماض العينين أو الحركة أو التصوير أو التسجيل أو لمس شيء أو قطفه أو تسلقه أو عبور طريق. "
        "لا تفترض وجود نبات أو حيوان بعينه؛ يمكن التأمل في لون أو ضوء أو ظل أو صوت. "
        f"تمرين مطلوب: {request.mode}. مثال على شكل المهمة المطلوبة: {examples[request.mode]} "
        f"وصف المكان اختياري: {request.place}."
    )
    try:
        raw = await ask_local_model(prompt, temperature=0.35)
        data = validate_mission(parse_json_object(raw), request.mode)
        data["source"] = "gemma3:4b"
        return data
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        data = fallback_mission(request.mode)
        data["source"] = "offline-card"
        return data


@app.post("/api/reflect")
async def reflect(request: ReflectionRequest):
    response_language = "Arabic" if request.language == "ar" else "English"
    prompt = (
        f"You are a supportive Arabic rhetoric teacher. Reply in {response_language}. "
        "Give concise educational feedback; do not claim a grammar error unless certain. "
        "Return JSON only with keys strength, suggestion, and rewrite. "
        f"النوع البلاغي المطلوب: {request.mode}. نص المتعلم: {request.reflection}"
    )
    try:
        raw = await ask_local_model(prompt, temperature=0.3)
        return {**validate_feedback(parse_json_object(raw), request.language), "source": MODEL_NAME}
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        if request.language == "en":
            return {
                "strength": "Nice observation. You turned a real detail into language.",
                "suggestion": "Try adding one concrete sensory detail to sharpen the image.",
                "rewrite": "Use a vivid detail from the scene to make the comparison more specific.",
                "source": "offline-feedback",
            }
        return {
            "strength": "أحسنت؛ لقد حوّلت ملاحظة حقيقية إلى صورة لغوية.",
            "suggestion": "أضف تفصيلًا حسيًا واحدًا ليصبح المشهد أوضح.",
            "rewrite": "استخدم تفصيلًا مما رأيت لتجعل التشبيه أكثر تحديدًا.",
            "source": "offline-feedback",
        }


@app.post("/api/translate")
async def translate(request: TranslationRequest):
    language = "Arabic" if request.target == "ar" else "English"
    prompt = (
        f"Translate the following text faithfully into {language}. Preserve meaning and tone. "
        "Return JSON only with one key: translation. Text: " + request.text
    )
    try:
        raw = await ask_local_model(prompt, temperature=0.1)
        translated = parse_json_object(raw).get("translation")
        if not isinstance(translated, str) or not translated.strip():
            raise ValueError("Invalid translation")
        return {"translation": translated.strip(), "source": MODEL_NAME}
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return {"translation": request.text, "source": "original-text"}


@app.post("/api/chat")
async def voice_chat(request: ChatRequest):
    language = "العربية الفصحى" if request.language == "ar" else "English"
    context = "\n".join(
        f"{turn.role}: {turn.content}" for turn in request.history[-8:]
    )
    prompt = (
        "You are Bayān, a concise, warm Arabic rhetoric mentor and outdoor reflection companion. "
        f"Reply in {language}. Keep Arabic language and rhetoric at the center. "
        "Give helpful conversational responses, do not claim to hear audio (you receive text only), "
        "and never give unsafe outdoor instructions. Return JSON only with key reply.\n"
        f"Recent conversation:\n{context}\nuser: {request.message}"
    )
    try:
        raw = await ask_local_model(prompt, temperature=0.45)
        reply = parse_json_object(raw).get("reply")
        if not isinstance(reply, str) or not reply.strip():
            raise ValueError("Invalid chat response")
        return {"reply": reply.strip(), "source": MODEL_NAME}
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        reply = (
            "أستطيع مساعدتك في البلاغة العربية. أعد المحاولة بعد التأكد من تشغيل Gemma المحلي."
            if request.language == "ar"
            else "I can help with Arabic rhetoric. Please retry after checking that local Gemma is running."
        )
        return {"reply": reply, "source": "offline-reply"}


def _synthesize_arabic_wav(text: str) -> bytes:
    global _piper_voice, _piper_voice_path
    if not PIPER_AR_VOICE or not Path(PIPER_AR_VOICE).is_file():
        raise FileNotFoundError("PIPER_AR_VOICE does not point to a local voice model")
    from piper import PiperVoice

    if _piper_voice is None or _piper_voice_path != PIPER_AR_VOICE:
        _piper_voice = PiperVoice.load(PIPER_AR_VOICE)
        _piper_voice_path = PIPER_AR_VOICE
    output = io.BytesIO()
    with wave.open(output, "wb") as wav_file:
        _piper_voice.synthesize_wav(text, wav_file)
    return output.getvalue()


@app.post("/api/speech")
async def speech(request: SpeechRequest):
    try:
        audio = await run_in_threadpool(_synthesize_arabic_wav, request.text)
    except (ImportError, FileNotFoundError):
        raise HTTPException(status_code=503, detail="Optional local Arabic Piper voice is not configured")
    except Exception as error:
        raise HTTPException(status_code=500, detail="Local Arabic speech synthesis failed") from error
    return Response(content=audio, media_type="audio/wav", headers={"Cache-Control": "no-store"})
