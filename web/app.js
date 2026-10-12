const $ = (selector) => document.querySelector(selector);
const state = {
  mission: null,
  feedback: null,
  walkInterval: null,
  recognition: null,
  chatHistory: [],
  dictationBase: "",
  dictationFinal: "",
  roundRewarded: false,
  score: Number(localStorage.getItem("bayaan-score") || 0),
  rounds: Number(localStorage.getItem("bayaan-rounds") || 0),
  language: localStorage.getItem("bayaan-language") === "en" ? "en" : "ar",
};
const sections = ["#mission-section", "#walk-screen", "#reflection-section", "#feedback-section"];

function updateGameHud() {
  const format = (value) => new Intl.NumberFormat("ar").format(value);
  $("#score").textContent = format(state.score);
  $("#round-number").textContent = format(state.rounds + 1);
  $("#xp-progress").style.width = `${state.score % 100}%`;
  $("#player-rank").textContent = state.score >= 200 ? "صانع البيان" : state.score >= 100 ? "مستكشف البلاغة" : "مبتدئ البلاغة";
}

function setGamePhase(phase) {
  ["choose", "outside", "write"].forEach((name, index) => {
    const element = $(`#step-${name}`);
    element.classList.toggle("completed", index + 1 < phase);
    element.classList.toggle("active", index + 1 === phase);
  });
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 3600);
}

function setBusy(button, busy, text) {
  button.disabled = busy;
  if (busy) {
    button.dataset.original = button.innerHTML;
    button.textContent = text;
  } else if (button.dataset.original) {
    button.innerHTML = button.dataset.original;
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}

const copy = {
  "#talk-label": ["تحدّث مع بَيَان", "Talk to Bayān"],
  "#theme-label": ["ليلي", "Dark"],
  ".intro .lede": ["اختر تحدّيًا، اكتشف العالم بعينيك، ثم عد بعبارة عربية تستحق نقاط الخبرة.", "Choose a quest, explore the world with your own eyes, then return with an Arabic image worthy of experience points."],
  ".intro .eyebrow": ["مغامرة بلاغية · الجولة", "Rhetoric quest · Round"],
  ".note-label": ["بطاقة التحدّي اليومي", "Daily challenge card"],
  ".note-word": ["تَشبيه", "Simile"],
  ".note-example": ["«الظلُّ عباءةٌ<br />ترتديها الأرض»", "“Shade is a cloak<br />the earth wears.”"],
  ".note-caption": ["لاحظ · تخيّل · صُغ", "Notice · imagine · phrase"],
  "#builder .eyebrow": ["اختر بطاقة التحدّي", "Choose a challenge card"],
  "#builder-title": ["أيُّ بابٍ من البلاغة ستفتحه؟", "Which door of rhetoric will you open?"],
  "#builder .round-index": ["المرحلة ١ من ٣", "Stage 1 of 3"],
  "#step-choose span": ["اختر مهمتك", "Choose your quest"],
  "#step-outside span": ["اخرج واكتشف", "Go explore"],
  "#step-write span": ["اكتب واكسب", "Write and earn"],
  ".mode-field legend": ["اختر تمرينك البلاغي", "Choose your rhetoric exercise"],
  ".mode-option:nth-child(1) strong": ["تشبيه", "Simile"],
  ".mode-option:nth-child(1) small": ["اربط مشهدًا بشيء تعرفه", "Compare a scene with something familiar"],
  ".mode-option:nth-child(2) strong": ["استعارة", "Metaphor"],
  ".mode-option:nth-child(2) small": ["امنح الطبيعة فعلًا أو صوتًا", "Give nature an action or voice"],
  ".mode-option:nth-child(3) strong": ["وصف حسّي", "Sensory description"],
  ".mode-option:nth-child(3) small": ["التقط التفاصيل بالكلمات", "Capture details with words"],
  "#place-label": ["أين ستكون جولتك؟ <span>اختياري</span>", "Where will you explore? <span>Optional</span>"],
  "#place": ["حديقة، فناء الجامعة، شارع هادئ…", "A garden, campus courtyard, quiet street…"],
  ".place-field p": ["لا نطلب موقعك الدقيق، ولا نحفظه.", "We do not request or store your precise location."],
  "#create-mission span:first-child": ["أنشئ مهمتي", "Create my quest"],
  ".mission-section .eyebrow": ["بطاقة مهمتك", "Your quest card"],
  "#mission-title": ["تأمّل ثم صُغ", "Observe, then compose"],
  ".mission-section .round-index": ["المرحلة ٢ من ٣", "Stage 2 of 3"],
  "#start-walk": ["سأخرج الآن", "Start exploring"],
  ".duration-label span": ["وقت التأمل", "Observation time"],
  "#duration option:nth-child(1)": ["دقيقتان", "2 minutes"],
  "#duration option:nth-child(2)": ["٥ دقائق", "5 minutes"],
  "#duration option:nth-child(3)": ["١٠ دقائق", "10 minutes"],
  ".walk-cue span": ["مهمّة ميدانيّة", "Field mission"],
  ".walk-cue strong": ["لاحظ ما حولك.", "Notice what is around you."],
  ".walk-cue small": ["أصغِ · تأمّل · تخيّل", "Listen · observe · imagine"],
  ".walk-screen .eyebrow": ["الآن دور العالم", "Now let the world speak"],
  ".walk-screen h2": ["ضع الهاتف جانبًا.", "Put your phone away."],
  ".walk-screen > p:not(.eyebrow):not(.walk-countdown):not(.walk-finished)": ["لا تحتاج إلى تصوير شيء. امشِ في مكان آمن، وتأمّل ما حولك. عُد حين تكون مستعدًا.", "No need to take a photo. Stay somewhere safe, notice what is around you, and return when you are ready."],
  "#walk-finished": ["انتهى وقت التأمل. عُد حين تكون مستعدًا.", "Your observation time is up. Return when you are ready."],
  "#return-from-walk": ["عدتُ من جولتي", "I'm back from my walk"],
  ".reflection-section .eyebrow": ["ما الذي رأيت؟", "What did you notice?"],
  "#reflection-title": ["حوّل ملاحظتك إلى صورة", "Turn your observation into an image"],
  ".reflection-section .round-index": ["المرحلة ٣ من ٣", "Stage 3 of 3"],
  "#reflection-label": ["اكتب عبارتك بالعربية", "Write your phrase"],
  "#reflection": ["مثال: كان ضوء العصر خيطًا ذهبيًا يخيط أطراف الغيم…", "Example: Evening light was a golden thread stitching the clouds…"],
  "#voice-input-label": ["أمْلِ عبارتك بالعربية", "Dictate your phrase"],
  "#voice-input-state": ["اضغط للتسجيل، واضغط مجددًا للتوقف.", "Tap to dictate; tap again to stop."],
  ".voice-disclosure": ["الإملاء الصوتي يعتمد على دعم المتصفح وقد يرسل الصوت إلى مزوّده. راجع النص قبل إرساله؛ لا يسجّل بَيَان الصوت ولا يحفظه.", "Speech recognition depends on browser support and may send audio to its provider. Review the transcript before sending; Bayān does not record or store audio."],
  "#get-feedback": ["تأمّل عبارتي", "Review my phrase"],
  ".feedback-section .eyebrow": ["اكتملت الجولة · +٢٥ نقطة خبرة", "Quest complete · +25 XP"],
  ".feedback-section h2": ["أحسنتَ التقاط الصورة.", "You caught the image."],
  "#round-result": ["وسام جديد", "New badge"],
  ".feedback-block:nth-child(1) span": ["١ / ما يلمع", "1 / What shines"],
  ".feedback-block:nth-child(2) span": ["٢ / خطوة تالية", "2 / Next step"],
  ".feedback-block:nth-child(3) span": ["٣ / اقتراح للصياغة", "3 / A phrasing idea"],
  "#speak-feedback": ["استمع إلى الرد بالعربية", "Listen to the response"],
  "#new-round": ["ابدأ جولة أخرى", "Start another round"],
  "footer span:first-child": ["بَيَان · العبارة تبدأ خارج الشاشة", "Bayān · The phrase begins off-screen"],
  "footer span:last-child": ["صوتك ونصك لا يُحفظان في التطبيق.", "Your voice and text are not stored by the app."],
  "#chat-title": ["تحدّث مع بَيَان", "Talk to Bayān"],
  ".chat-head .eyebrow": ["محادثة صوتية ونصية", "Voice and text conversation"],
  ".chat-disclosure": ["تعمل المحادثة عبر نص محلي مع Gemma. الإملاء قد يستخدم خدمة المتصفح؛ راجع النص قبل الإرسال.", "Chat uses local Gemma text inference. Dictation may use a browser speech service; review the transcript before sending."],
  ".chat-empty": ["اكتب رسالتك أو أمْلِها بالعربية، وسأجيبك بصوت إن توفر.", "Type or dictate a message. Bayān replies in your selected language and can speak when a voice is available."],
  ".chat-form label": ["رسالتك", "Your message"],
  "#chat-input": ["اكتب أو أمْلِ رسالتك…", "Type or dictate your message…"],
  "#chat-mic-label": ["ابدأ الإملاء", "Start dictation"],
  "#chat-send": ["أرسل", "Send"],
  ".speak-toggle span": ["انطق الرد بالعربية", "Speak replies aloud"],
  ".field-note": [null, null],
};

function currentLanguageIndex() {
  return state.language === "ar" ? 0 : 1;
}

function applyLanguage() {
  const index = currentLanguageIndex();
  document.documentElement.lang = state.language;
  document.documentElement.dir = state.language === "ar" ? "rtl" : "ltr";
  $("#language-toggle").textContent = state.language === "ar" ? "EN" : "عربي";
  $("#language-toggle").setAttribute("aria-label", state.language === "ar" ? "Switch interface language to English" : "حوّل لغة الواجهة إلى العربية");
  Object.entries(copy).forEach(([selector, values]) => {
    if (!values[index]) return;
    const element = $(selector);
    if (!element) return;
    const value = values[index];
    if (selector === "#place-label") element.innerHTML = value;
    else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) element.placeholder = value;
    else if (selector === ".walk-cue span") element.textContent = value;
    else if (selector === "#start-walk" || selector === "#return-from-walk" || selector === "#get-feedback" || selector === "#speak-feedback" || selector === "#new-round") {
      const firstText = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (firstText) firstText.textContent = `${value} `;
    } else if (selector === "#create-mission span:first-child") element.textContent = value;
    else element.textContent = value;
  });
  $(".intro .eyebrow").innerHTML = state.language === "ar"
    ? `<span class="live-mark"></span> مغامرة بلاغية · الجولة <b id="round-number">${new Intl.NumberFormat("ar").format(state.rounds + 1)}</b>`
    : `<span class="live-mark"></span> Rhetoric quest · Round <b id="round-number">${state.rounds + 1}</b>`;
  $("h1").innerHTML = state.language === "ar" ? "اخرج لتجدَ <em>صورتك.</em>" : "Step outside. Find <em>your image.</em>";
  $(".walk-countdown").dir = "ltr";
  $("#reflection").dir = state.language === "ar" ? "rtl" : "ltr";
  $("#chat-input").dir = state.language === "ar" ? "rtl" : "ltr";
  const themeDark = document.documentElement.dataset.theme === "dark";
  const themeAction = state.language === "ar"
    ? (themeDark ? "الوضع الفاتح" : "الوضع الداكن")
    : (themeDark ? "Light mode" : "Dark mode");
  $("#theme-label").textContent = themeAction;
  $("#theme-toggle").setAttribute("aria-label", themeAction);
  $("#theme-toggle").title = themeAction;
  $("#player-rank").textContent = state.language === "ar"
    ? (state.score >= 200 ? "صانع البيان" : state.score >= 100 ? "مستكشف البلاغة" : "مبتدئ البلاغة")
    : (state.score >= 200 ? "Rhetoric artisan" : state.score >= 100 ? "Rhetoric explorer" : "Rhetoric beginner");
  $("#score").nextElementSibling.textContent = state.language === "ar" ? "نقطة" : "XP";
  const modelText = $("#model-status span");
  if (modelText.dataset.state) {
    modelText.textContent = state.language === "ar"
      ? (modelText.dataset.state === "ready" ? "نموذج عربي محلي جاهز" : "وضع البطاقات العربية متاح")
      : (modelText.dataset.state === "ready" ? "Local Gemma ready" : "Offline Arabic cards ready");
  }
  $("#close-chat").setAttribute("aria-label", state.language === "ar" ? "إغلاق" : "Close");
  document.title = state.language === "ar" ? "بَيَان | امشِ، تأمّل، ثم اكتب" : "Bayān | Walk, notice, write";
  const languageTitle = state.language === "ar" ? {"تشبيه":"تشبيه", "استعارة":"استعارة", "وصف حسي":"وصف حسّي"} : {"تشبيه":"Simile", "استعارة":"Metaphor", "وصف حسي":"Sensory description"};
  if (state.mission) $("#mission-mode").textContent = languageTitle[state.mission.mode] || state.mission.mode;
  if (state.mission && !$("#mission-section").classList.contains("hidden")) {
    $("#mission-source").textContent = state.language === "ar"
      ? (state.mission.source === "gemma3:4b" ? "صاغها نموذج Gemma المحلي" : "بطاقة عربية تعمل دون اتصال بالنموذج")
      : (state.mission.source === "gemma3:4b" ? "Generated with local Gemma" : "Curated offline quest card");
  }
  if (state.score > 0 && !$("#feedback-section").classList.contains("hidden")) {
    $(".feedback-section .eyebrow").textContent = state.language === "ar"
      ? `اكتملت الجولة · +${new Intl.NumberFormat("ar").format(25)} نقطة خبرة`
      : "Quest complete · +25 XP";
    $("#round-result").textContent = state.language === "ar" ? "وسام الملاحظة +٢٥" : "Observation badge +25";
  }
}

async function translateText(text, target) {
  try {
    const result = await postJson("/api/translate", { text, target });
    return result.translation;
  } catch {
    return text;
  }
}

async function translateCurrentContent() {
  const target = state.language;
  if (state.mission) {
    const [prompt, question] = await Promise.all([
      translateText(state.mission.prompt, target),
      translateText(state.mission.question, target),
    ]);
    $("#mission-prompt").textContent = prompt;
    $("#mission-question").textContent = question;
    $("#reflection-reminder").textContent = prompt;
  }
  if (state.feedback) {
    const [strength, suggestion, rewrite] = await Promise.all([
      translateText(state.feedback.strength, target),
      translateText(state.feedback.suggestion, target),
      translateText(state.feedback.rewrite, target),
    ]);
    $("#feedback-strength").textContent = strength;
    $("#feedback-suggestion").textContent = suggestion;
    $("#feedback-rewrite").textContent = rewrite;
  }
  for (const bubble of $("#chat-messages").querySelectorAll("[data-original]")) {
    bubble.textContent = await translateText(bubble.dataset.original, target);
    bubble.dir = target === "ar" ? "rtl" : "ltr";
  }
}

$("#language-toggle").addEventListener("click", async () => {
  state.language = state.language === "ar" ? "en" : "ar";
  localStorage.setItem("bayaan-language", state.language);
  applyLanguage();
  await translateCurrentContent();
});

function appendChatBubble(role, text) {
  const bubble = document.createElement("article");
  bubble.className = `chat-bubble ${role}`;
  bubble.dataset.original = text;
  bubble.dir = state.language === "ar" ? "rtl" : "ltr";
  const speaker = document.createElement("span");
  speaker.textContent = role === "assistant"
    ? (state.language === "ar" ? "بَيَان" : "Bayān")
    : (state.language === "ar" ? "أنت" : "You");
  const content = document.createElement("p");
  content.textContent = text;
  bubble.append(speaker, content);
  $("#chat-messages").append(bubble);
  $(".chat-empty")?.remove();
  bubble.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function speakText(text, statusElement = $("#chat-voice-state")) {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    statusElement.textContent = state.language === "ar" ? "الصوت غير مدعوم في هذا المتصفح." : "Speech output is not supported in this browser.";
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = state.language === "ar" ? "ar-SA" : "en-US";
  utterance.rate = 0.92;
  const prefix = state.language === "ar" ? "ar" : "en";
  const voice = window.speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith(prefix));
  if (!voice) {
    if (state.language === "ar") {
      statusElement.textContent = "جارٍ إعداد الصوت العربي المحلي…";
      fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language: "ar" }),
      }).then(async (response) => {
        if (!response.ok) throw new Error("Local voice is not configured");
        const audioUrl = URL.createObjectURL(await response.blob());
        const audio = new Audio(audioUrl);
        audio.onended = () => URL.revokeObjectURL(audioUrl);
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          statusElement.textContent = "تعذّر تشغيل الرد الصوتي.";
        };
        statusElement.textContent = "بَيَان يتحدث بالعربية…";
        await audio.play();
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          statusElement.textContent = "";
        };
      }).catch(() => {
        statusElement.textContent = "لا يوجد صوت عربي مثبت. فعّل Piper المحلي أو تابع المحادثة نصيًا.";
      });
    } else {
      statusElement.textContent = "No matching English system voice is installed. Continue by text.";
    }
    return;
  }
  if (voice) utterance.voice = voice;
  utterance.onstart = () => { statusElement.textContent = state.language === "ar" ? "بَيَان يتحدث…" : "Bayān is speaking…"; };
  utterance.onend = () => { statusElement.textContent = ""; };
  utterance.onerror = () => {
    statusElement.textContent = state.language === "ar" ? "تعذّر تشغيل الصوت؛ تحقّق من الأصوات المثبتة." : "Could not play speech; check installed voices.";
  };
  window.speechSynthesis.speak(utterance);
}

function beginDictation(button, target, label, statusElement) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    statusElement.textContent = state.language === "ar"
      ? "الإملاء الصوتي غير مدعوم في هذا المتصفح. استخدم الكتابة أو جرّب Chrome."
      : "Speech recognition is unavailable here. Type instead or try Chrome.";
    return;
  }
  if (state.recognition) {
    state.recognition.stop();
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = state.language === "ar" ? "ar-SA" : "en-US";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  const existing = target.value.trim();
  let finalTranscript = "";
  state.recognition = recognition;
  recognition.onstart = () => {
    button.classList.add("recording");
    button.setAttribute("aria-pressed", "true");
    label.textContent = state.language === "ar" ? "أوقف الاستماع" : "Stop listening";
    statusElement.textContent = state.language === "ar" ? "أستمع الآن… اضغط لإيقاف الإملاء." : "Listening… tap to stop.";
  };
  recognition.onresult = (event) => {
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const phrase = event.results[index][0].transcript.trim();
      if (event.results[index].isFinal) finalTranscript += `${phrase} `;
      else interim += `${phrase} `;
    }
    target.value = [existing, `${finalTranscript}${interim}`.trim()].filter(Boolean).join(" ");
    target.dispatchEvent(new Event("input", { bubbles: true }));
    statusElement.textContent = interim
      ? `${state.language === "ar" ? "أسمع" : "Hearing"}: ${interim}`
      : (state.language === "ar" ? "وصلت الكلمات؛ راجعها قبل الإرسال." : "Transcript ready; review it before sending.");
  };
  recognition.onerror = (event) => {
    const errors = {
      "not-allowed": state.language === "ar" ? "لم يُسمح بالميكروفون." : "Microphone permission was denied.",
      "no-speech": state.language === "ar" ? "لم ألتقط كلامًا. حاول مجددًا." : "No speech detected. Try again.",
      "network": state.language === "ar" ? "خدمة إملاء المتصفح تحتاج إلى اتصال." : "The browser speech service requires a network connection.",
    };
    statusElement.textContent = errors[event.error] || (state.language === "ar" ? "تعذّر الإملاء." : "Dictation failed.");
  };
  recognition.onend = () => {
    state.recognition = null;
    button.classList.remove("recording");
    button.setAttribute("aria-pressed", "false");
    label.textContent = state.language === "ar" ? "ابدأ الإملاء" : "Start dictation";
    if (finalTranscript) statusElement.textContent = state.language === "ar" ? "راجع النص وصحّحه قبل الإرسال." : "Review and correct the transcript before sending.";
  };
  try {
    recognition.start();
  } catch {
    state.recognition = null;
    statusElement.textContent = state.language === "ar" ? "تعذّر بدء الميكروفون. تحقّق من إذن المتصفح." : "Could not start microphone. Check browser permission.";
  }
}

$("#voice-chat-open").addEventListener("click", () => $("#voice-chat-dialog").showModal());
$("#close-chat").addEventListener("click", () => $("#voice-chat-dialog").close());
$("#voice-chat-dialog").addEventListener("click", (event) => {
  if (event.target === $("#voice-chat-dialog")) $("#voice-chat-dialog").close();
});
$("#chat-mic").addEventListener("click", () => beginDictation($("#chat-mic"), $("#chat-input"), $("#chat-mic-label"), $("#chat-voice-state")));

$("#chat-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = $("#chat-input").value.trim();
  if (!message) return;
  appendChatBubble("user", message);
  $("#chat-input").value = "";
  const button = $("#chat-send");
  setBusy(button, true, state.language === "ar" ? "يفكر بَيَان…" : "Bayān is thinking…");
  try {
    const result = await postJson("/api/chat", {
      message,
      language: state.language,
      history: state.chatHistory.slice(-8),
    });
    state.chatHistory.push({ role: "user", content: message }, { role: "assistant", content: result.reply });
    state.chatHistory = state.chatHistory.slice(-8);
    appendChatBubble("assistant", result.reply);
    if ($("#auto-speak").checked) speakText(result.reply);
  } catch {
    const error = state.language === "ar" ? "تعذّر الاتصال بالنموذج المحلي. تحقّق من تشغيل Ollama." : "Could not reach the local model. Check that Ollama is running.";
    appendChatBubble("assistant", error);
  } finally {
    setBusy(button, false);
  }
});

function selectedMode() {
  return document.querySelector('input[name="mode"]:checked').value;
}

function hideSections() {
  sections.forEach((selector) => $(selector).classList.add("hidden"));
}

$("#create-mission").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  setBusy(button, true, "نصوغ مهمتك…");
  try {
    state.mission = await postJson("/api/mission", {
      mode: selectedMode(),
      place: $("#place").value.trim() || "مكان آمن في الخارج",
    });
    $("#mission-mode").textContent = state.mission.mode;
    $("#mission-prompt").textContent = state.mission.prompt;
    $("#mission-question").textContent = state.mission.question;
    $("#mission-source").textContent = state.mission.source === "gemma3:4b" ? "صاغها نموذج Gemma المحلي" : "بطاقة عربية تعمل دون اتصال بالنموذج";
    state.roundRewarded = false;
    setGamePhase(2);
    hideSections();
    $("#mission-section").classList.remove("hidden");
    if (state.language === "en") await translateCurrentContent();
    $("#mission-section").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    showToast("تعذّر الاتصال بالخادم المحلي. شغّل التطبيق ثم أعد المحاولة.");
  } finally {
    setBusy(button, false);
  }
});

$("#start-walk").addEventListener("click", () => {
  window.clearInterval(state.walkInterval);
  setGamePhase(2);
  let remaining = Number($("#duration").value) * 60;
  const countdown = $("#walk-countdown");
  const finished = $("#walk-finished");
  finished.classList.add("hidden");
  const renderCountdown = () => {
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    const format = (value) => new Intl.NumberFormat("ar", { minimumIntegerDigits: 2, useGrouping: false }).format(value);
    countdown.textContent = `${format(minutes)}:${format(seconds)}`;
  };
  renderCountdown();
  state.walkInterval = window.setInterval(() => {
    remaining -= 1;
    renderCountdown();
    if (remaining <= 0) {
      window.clearInterval(state.walkInterval);
      finished.classList.remove("hidden");
    }
  }, 1000);
  hideSections();
  $("#walk-screen").classList.remove("hidden");
  $("#walk-screen").scrollIntoView({ behavior: "smooth", block: "center" });
  document.title = "خارج الشاشة | بَيَان";
});

$("#return-from-walk").addEventListener("click", () => {
  window.clearInterval(state.walkInterval);
  setGamePhase(3);
  $("#walk-screen").classList.add("hidden");
  $("#reflection-reminder").textContent = state.mission?.prompt || "تأمّل ما حولك ثم اكتب عبارتك.";
  $("#reflection").value = "";
  updateCounter();
  $("#reflection-section").classList.remove("hidden");
  $("#reflection-section").scrollIntoView({ behavior: "smooth", block: "start" });
  document.title = "اكتب ملاحظتك | بَيَان";
});

function updateCounter() {
  const count = $("#reflection").value.length;
  $("#char-count").textContent = `${new Intl.NumberFormat("ar").format(count)} / ٥٠٠`;
}
$("#reflection").addEventListener("input", updateCounter);

$("#reflection-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#get-feedback");
  setBusy(button, true, "نتأمّل عبارتك…");
  try {
    state.feedback = await postJson("/api/reflect", {
      mode: state.mission?.mode || selectedMode(),
      reflection: $("#reflection").value.trim(),
      language: state.language,
    });
    $("#feedback-strength").textContent = state.feedback.strength;
    $("#feedback-suggestion").textContent = state.feedback.suggestion;
    $("#feedback-rewrite").textContent = state.feedback.rewrite;
    if (!state.roundRewarded) {
      state.score += 25;
      state.rounds += 1;
      state.roundRewarded = true;
      localStorage.setItem("bayaan-score", String(state.score));
      localStorage.setItem("bayaan-rounds", String(state.rounds));
      updateGameHud();
      $("#round-result").textContent = state.score % 100 === 0 ? "ارتقيتَ إلى مستوى جديد!" : "وسام الملاحظة +٢٥";
    }
    if (state.language === "en") await translateCurrentContent();
    $("#reflection-section").classList.add("hidden");
    $("#feedback-section").classList.remove("hidden");
    $("#feedback-section").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    showToast("لم تصل التغذية الراجعة. تحقّق من اتصال التطبيق المحلي.");
  } finally {
    setBusy(button, false);
  }
});

const voiceInput = $("#voice-input");
voiceInput.addEventListener("click", () => beginDictation(voiceInput, $("#reflection"), $("#voice-input-label"), $("#voice-input-state")));

$("#speak-feedback").addEventListener("click", () => {
  speakText([
    state.feedback?.strength,
    state.feedback?.suggestion,
    state.feedback?.rewrite,
  ].filter(Boolean).join(". "), $("#speech-status"));
});

$("#new-round").addEventListener("click", () => {
  hideSections();
  setGamePhase(1);
  $("#builder").scrollIntoView({ behavior: "smooth", block: "start" });
  document.title = "بَيَان | امشِ، تأمّل، ثم اكتب";
});

const themeToggle = $("#theme-toggle");
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === "dark";
  const action = state.language === "ar"
    ? (dark ? "الوضع الفاتح" : "الوضع الداكن")
    : (dark ? "Light mode" : "Dark mode");
  $("#theme-label").textContent = action;
  themeToggle.setAttribute("aria-label", action);
  themeToggle.title = action;
  localStorage.setItem("bayaan-theme", theme);
}
setTheme(localStorage.getItem("bayaan-theme") || "light");
themeToggle.addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

async function checkModel() {
  const status = $("#model-status");
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    if (data.model_available) {
      status.classList.add("ready");
      status.dataset.state = "ready";
    } else {
      status.dataset.state = "offline";
    }
    applyLanguage();
  } catch {
    status.dataset.state = "offline";
    status.lastElementChild.textContent = state.language === "ar" ? "تعذّر فحص النموذج" : "Model check failed";
  }
}
checkModel();
updateGameHud();
applyLanguage();
