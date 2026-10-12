const $ = (selector) => document.querySelector(selector);
const state = {
  mission: null,
  feedback: null,
  walkInterval: null,
  recognition: null,
  dictationBase: "",
  dictationFinal: "",
  roundRewarded: false,
  score: Number(localStorage.getItem("bayaan-score") || 0),
  rounds: Number(localStorage.getItem("bayaan-rounds") || 0),
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
    $("#reflection-section").classList.add("hidden");
    $("#feedback-section").classList.remove("hidden");
    $("#feedback-section").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    showToast("لم تصل التغذية الراجعة. تحقّق من اتصال التطبيق المحلي.");
  } finally {
    setBusy(button, false);
  }
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const voiceInput = $("#voice-input");

if (!SpeechRecognition) {
  voiceInput.disabled = true;
  $("#voice-input-label").textContent = "الإملاء الصوتي غير مدعوم في هذا المتصفح";
  $("#voice-input-state").textContent = "يمكنك كتابة عبارتك بالعربية في الحقل أعلاه.";
} else {
  voiceInput.addEventListener("click", () => {
    if (state.recognition) {
      state.recognition.stop();
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "ar-SA";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    state.dictationBase = $("#reflection").value.trim();
    state.dictationFinal = "";
    state.recognition = recognition;
    recognition.onstart = () => {
      voiceInput.classList.add("recording");
      voiceInput.setAttribute("aria-pressed", "true");
      $("#voice-input-label").textContent = "أوقف الإملاء";
      $("#voice-input-state").textContent = "أستمع الآن… اضغط لإيقاف الإملاء.";
    };
    recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const phrase = event.results[index][0].transcript.trim();
        if (event.results[index].isFinal) state.dictationFinal += `${phrase} `;
        else interim += `${phrase} `;
      }
      const recognized = `${state.dictationFinal}${interim}`.trim();
      $("#reflection").value = [state.dictationBase, recognized].filter(Boolean).join(" ");
      updateCounter();
      $("#voice-input-state").textContent = interim ? `أسمع: ${interim}` : "وصلت الكلمات؛ يمكنك مراجعتها قبل الإرسال.";
    };
    recognition.onerror = (event) => {
      const messages = {
        "not-allowed": "لم يُسمح باستخدام الميكروفون. يمكنك الكتابة بدلًا من ذلك.",
        "no-speech": "لم ألتقط كلامًا. اضغط وحاول مرة أخرى.",
        "network": "خدمة الإملاء في المتصفح تحتاج إلى اتصال بالشبكة.",
      };
      $("#voice-input-state").textContent = messages[event.error] || "تعذّر الإملاء؛ يمكنك كتابة عبارتك يدويًا.";
    };
    recognition.onend = () => {
      state.recognition = null;
      voiceInput.classList.remove("recording");
      voiceInput.setAttribute("aria-pressed", "false");
      $("#voice-input-label").textContent = "أمْلِ عبارتك بالعربية";
      if (state.dictationFinal) $("#voice-input-state").textContent = "راجع النص المنسوخ وصحّحه قبل إرساله.";
    };
    try {
      recognition.start();
    } catch {
      state.recognition = null;
      $("#voice-input-state").textContent = "تعذّر بدء الميكروفون. تحقّق من إذن المتصفح.";
    }
  });
}

$("#speak-feedback").addEventListener("click", () => {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    $("#speech-status").textContent = "الصوت غير مدعوم في هذا المتصفح.";
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance([
    state.feedback?.strength,
    state.feedback?.suggestion,
    state.feedback?.rewrite,
  ].filter(Boolean).join(". "));
  utterance.lang = "ar-SA";
  utterance.rate = 0.9;
  const arabicVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("ar"));
  if (arabicVoice) utterance.voice = arabicVoice;
  utterance.onstart = () => { $("#speech-status").textContent = "أقرأ التغذية الراجعة بالعربية…"; };
  utterance.onend = () => { $("#speech-status").textContent = ""; };
  utterance.onerror = () => { $("#speech-status").textContent = "تعذّر تشغيل الصوت؛ قد لا يتوفر صوت عربي على جهازك."; };
  window.speechSynthesis.speak(utterance);
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
  themeToggle.textContent = dark ? "☼" : "◐";
  themeToggle.setAttribute("aria-label", dark ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن");
  themeToggle.title = dark ? "الوضع الفاتح" : "الوضع الداكن";
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
      status.lastElementChild.textContent = "نموذج عربي محلي جاهز";
    } else {
      status.lastElementChild.textContent = "وضع البطاقات العربية متاح";
    }
  } catch {
    status.lastElementChild.textContent = "تعذّر فحص النموذج";
  }
}
checkModel();
updateGameHud();
