const $ = (selector) => document.querySelector(selector);
const state = { mission: null, feedback: null, walkInterval: null };
const sections = ["#mission-section", "#walk-screen", "#reflection-section", "#feedback-section"];

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
    $("#mission-translation").classList.add("hidden");
    $("#mission-translation").textContent = "";
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
    $("#feedback-translation").classList.add("hidden");
    $("#feedback-translation").textContent = "";
    $("#reflection-section").classList.add("hidden");
    $("#feedback-section").classList.remove("hidden");
    $("#feedback-section").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    showToast("لم تصل التغذية الراجعة. تحقّق من اتصال التطبيق المحلي.");
  } finally {
    setBusy(button, false);
  }
});

async function translateText(text, target) {
  const result = await postJson("/api/translate", { text, language: "English" });
  target.textContent = result.translation;
  target.classList.remove("hidden");
}

$("#translate-mission").addEventListener("click", async () => {
  const button = $("#translate-mission");
  try {
    if ($( "#mission-translation").classList.contains("hidden")) {
      setBusy(button, true, "Translating…");
      await translateText(`${state.mission.prompt}\n${state.mission.question}`, $("#mission-translation"));
      button.textContent = "Hide English translation";
    } else {
      $("#mission-translation").classList.add("hidden");
      button.textContent = "Translate this mission into English ↗";
    }
  } catch {
    showToast("لم تتوفر الترجمة الآن.");
  } finally {
    setBusy(button, false);
  }
});

$("#translate-feedback").addEventListener("click", async () => {
  const button = $("#translate-feedback");
  try {
    setBusy(button, true, "Translating…");
    const text = Object.values(state.feedback || {}).filter((value) => typeof value === "string").join("\n");
    await translateText(text, $("#feedback-translation"));
  } catch {
    showToast("لم تتوفر الترجمة الآن.");
  } finally {
    setBusy(button, false);
  }
});

$("#new-round").addEventListener("click", () => {
  hideSections();
  $("#builder").scrollIntoView({ behavior: "smooth", block: "start" });
  document.title = "بَيَان | امشِ، تأمّل، ثم اكتب";
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
