import os
from typing import Literal

import httpx
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

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

app = FastAPI(title="بَيَان | Bayān Walk", description="لعبة بلاغية عربية للمشي والتأمل")
app.mount("/static", StaticFiles(directory=os.path.join(ROOT, "web")), name="static")


class MissionRequest(BaseModel):
    mode: Literal["تشبيه", "استعارة", "وصف حسي"] = "تشبيه"
    place: str = Field(default="مكان آمن في الخارج", max_length=80)


class ReflectionRequest(BaseModel):
    mode: Literal["تشبيه", "استعارة", "وصف حسي"]
    reflection: str = Field(min_length=2, max_length=500)


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
    prompt = (
        "أنت معلّم بلاغة عربية مشجّع ودقيق. قدّم تغذية راجعة تعليمية قصيرة بلغة عربية فصحى، "
        "ولا تدّع وجود خطأ نحوي إلا إن كنت واثقًا. احترم المعنى الذي قصده المتعلم. "
        "أخرج JSON فقط بالمفاتيح strength و suggestion و rewrite، وكل قيمة جملة قصيرة بالعربية. "
        f"النوع البلاغي المطلوب: {request.mode}. نص المتعلم: {request.reflection}"
    )
    try:
        raw = await ask_local_model(prompt, temperature=0.3)
        return {**validate_feedback(parse_json_object(raw)), "source": "gemma3:4b"}
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return {
            "strength": "أحسنت؛ لقد توقفت لتلاحظ العالم وصغت ملاحظتك بالعربية.",
            "suggestion": f"راجع نصك واسأل نفسك: هل تظهر فيه {request.mode} بوضوح؟",
            "rewrite": "يمكنك تحسين الصورة بإضافة تفصيل حسي واحد من ملاحظتك.",
            "source": "offline-feedback",
        }
