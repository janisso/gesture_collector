const output = document.getElementById("output");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startSessionBtn");
const consentCheckbox = document.getElementById("consent");
const sessionBadge = document.getElementById("sessionBadge");
const trialBadge = document.getElementById("trialBadge");
const runDummyBtn = document.getElementById("runDummyBtn");
const submitTrialBtn = document.getElementById("submitTrialBtn");
const trialSummary = document.getElementById("trialSummary");

let sessionId = "";
let currentTrial = null;

function setStatus(text) {
  statusEl.textContent = text;
}

function setOutput(value) {
  output.textContent =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function updateSessionBadge() {
  if (sessionId) {
    sessionBadge.textContent = "Session ready";
    sessionBadge.classList.remove("muted");
  } else {
    sessionBadge.textContent = "No session";
    sessionBadge.classList.add("muted");
  }
}

function updateTrialBadge() {
  if (currentTrial) {
    trialBadge.textContent = "Trial ready";
    trialBadge.classList.remove("muted");
  } else {
    trialBadge.textContent = "No trial";
    trialBadge.classList.add("muted");
  }
}

function updateButtons() {
  startBtn.disabled = !consentCheckbox.checked;
  runDummyBtn.disabled = !sessionId;
  submitTrialBtn.disabled = !sessionId || !currentTrial;
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Fallback: not cryptographically strong, but fine for demo
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function startSession() {
  setStatus("Starting…");
  setOutput("");

  if (!consentCheckbox.checked) {
    throw new Error("Consent is required to start a session");
  }

  const payload = {
    study_id: "gesture_mapping_local",
    study_version: new Date().toISOString().slice(0, 10),
    schema_version: 1,
    consent_version: "v1",
  };

  const response = await fetch("/api/start_session.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.error ?? `HTTP ${response.status}`);
  }
  return json;
}

function buildDummyTrial() {
  if (!sessionId) {
    throw new Error("Start a session first");
  }

  const trialId = uuid();
  const trialIndex = 0;
  const stimulusId = "dummy_stimulus";

  const durationMs = 2000;
  const sampleCount = 20;
  const tStart = performance.now();
  const tEnd = tStart + durationMs;

  const samples = [];
  for (let i = 0; i < sampleCount; i += 1) {
    const t = tStart + (durationMs / (sampleCount - 1)) * i;
    const phase = (i / sampleCount) * Math.PI * 2;
    samples.push({
      t_ms: t,
      acc: { x: Math.sin(phase), y: Math.cos(phase), z: 9.81 },
      acc_g: { x: 0.02, y: 0.01, z: 9.81 },
      rot: { a: Math.cos(phase) * 0.2, b: Math.sin(phase) * 0.2, g: 0.05 },
      interval_ms: durationMs / sampleCount,
    });
  }

  const diagnostics = {
    sample_count: sampleCount,
    duration_ms: durationMs,
    effective_hz: Number((sampleCount / (durationMs / 1000)).toFixed(2)),
    missing: { acc: 0, acc_g: 0, rot: 0, ori: sampleCount },
  };

  const survey = {
    tags: ["dummy"],
    confidence: 5,
    notes: "Generated locally (no sensors).",
  };

  return {
    trial_id: trialId,
    trial_index: trialIndex,
    stimulus_id: stimulusId,
    t_start_perf_ms: tStart,
    t_end_perf_ms: tEnd,
    diagnostics,
    survey,
    samples,
  };
}

async function submitTrial() {
  if (!sessionId) {
    throw new Error("No session_id—start session first");
  }
  if (!currentTrial) {
    throw new Error("No trial data—run dummy trial first");
  }

  const payload = {
    schema_version: 1,
    study_id: "gesture_mapping_local",
    study_version: new Date().toISOString().slice(0, 10),
    session_id: sessionId,
    trial_id: currentTrial.trial_id,
    trial_index: currentTrial.trial_index,
    stimulus_id: currentTrial.stimulus_id,
    t_start_perf_ms: currentTrial.t_start_perf_ms,
    t_end_perf_ms: currentTrial.t_end_perf_ms,
    survey: currentTrial.survey,
    diagnostics: currentTrial.diagnostics,
    samples: currentTrial.samples,
  };

  const response = await fetch("/api/submit_trial.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.error ?? `HTTP ${response.status}`);
  }
  return json;
}

consentCheckbox.addEventListener("change", () => {
  updateButtons();
});

startBtn.addEventListener("click", async () => {
  try {
    const json = await startSession();
    sessionId = json.session_id;
    currentTrial = null;
    updateSessionBadge();
    updateTrialBadge();
    updateButtons();
    setOutput(json);
    setStatus("Session created");
  } catch (err) {
    setStatus("Error");
    setOutput(String(err?.message ?? err));
  }
});

runDummyBtn.addEventListener("click", () => {
  try {
    currentTrial = buildDummyTrial();
    updateTrialBadge();
    updateButtons();
    const summary = {
      trial_id: currentTrial.trial_id,
      samples: currentTrial.samples.length,
      duration_ms: currentTrial.diagnostics.duration_ms,
      effective_hz: currentTrial.diagnostics.effective_hz,
    };
    trialSummary.textContent = JSON.stringify(summary, null, 2);
    setStatus("Dummy trial ready");
    setOutput("Dummy trial created; ready to submit.");
  } catch (err) {
    setStatus("Error");
    setOutput(String(err?.message ?? err));
  }
});

submitTrialBtn.addEventListener("click", async () => {
  try {
    const json = await submitTrial();
    setStatus("Trial submitted");
    setOutput(json);
  } catch (err) {
    setStatus("Error");
    setOutput(String(err?.message ?? err));
  }
});

// Initial UI state
updateSessionBadge();
updateTrialBadge();
updateButtons();
setOutput("Waiting to start session…");
