const output = document.getElementById("output");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startSessionBtn");
const consentCheckbox = document.getElementById("consent");
const sessionBadge = document.getElementById("sessionBadge");
const trialBadge = document.getElementById("trialBadge");
const runDummyBtn = document.getElementById("runDummyBtn");
const submitTrialBtn = document.getElementById("submitTrialBtn");
const trialSummary = document.getElementById("trialSummary");
const sensorBadge = document.getElementById("sensorBadge");
const sensorStatus = document.getElementById("sensorStatus");
const sensorWarnings = document.getElementById("sensorWarnings");
const enableSensorsBtn = document.getElementById("enableSensorsBtn");
const hzEstimate = document.getElementById("hzEstimate");
const liveSamples = document.getElementById("liveSamples");
const startRecordBtn = document.getElementById("startRecordBtn");
const stopRecordBtn = document.getElementById("stopRecordBtn");
const recordBadge = document.getElementById("recordBadge");
const recordSummary = document.getElementById("recordSummary");

let sessionId = "";
let currentTrial = null;
let sensorsEnabled = false;
let listenersAttached = false;
let liveCount = 0;
let liveStartTime = 0;
let isRecording = false;
let recordStart = 0;
let samples = [];
let latestOrientation = null;
let sensorsSupported = true;

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

function updateSensorBadge() {
  if (!sensorsSupported) {
    sensorBadge.textContent = "Unsupported";
    sensorBadge.classList.add("muted");
    return;
  }
  if (sensorsEnabled) {
    sensorBadge.textContent = "Sensors on";
    sensorBadge.classList.remove("muted");
  } else {
    sensorBadge.textContent = "Sensors off";
    sensorBadge.classList.add("muted");
  }
}

function updateRecordBadge() {
  if (isRecording) {
    recordBadge.textContent = "Recording…";
    recordBadge.classList.remove("muted");
  } else {
    recordBadge.textContent = "Idle";
    recordBadge.classList.add("muted");
  }
}

function updateButtons() {
  startBtn.disabled = !consentCheckbox.checked;
  runDummyBtn.disabled = !sessionId;
  submitTrialBtn.disabled = !sessionId || !currentTrial;
  enableSensorsBtn.disabled = sensorsEnabled || !sensorsSupported;
  startRecordBtn.disabled = !sessionId || !sensorsEnabled || isRecording || !sensorsSupported;
  stopRecordBtn.disabled = !isRecording;
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
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

  const samplesArr = [];
  for (let i = 0; i < sampleCount; i += 1) {
    const t = tStart + (durationMs / (sampleCount - 1)) * i;
    const phase = (i / sampleCount) * Math.PI * 2;
    samplesArr.push({
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
    samples: samplesArr,
  };
}

function toVector(source, keys) {
  if (!source) return null;
  const out = {};
  let has = false;
  keys.forEach((key) => {
    const val = source[key];
    if (typeof val === "number" && Number.isFinite(val)) {
      out[key] = val;
      has = true;
    }
  });
  return has ? out : null;
}

function handleOrientation(event) {
  latestOrientation = {
    alpha: event.alpha,
    beta: event.beta,
    gamma: event.gamma,
  };
}

function handleMotion(event) {
  if (!sensorsSupported) return;

  const now = performance.now();
  if (!liveStartTime) {
    liveStartTime = now;
  }
  liveCount += 1;
  const elapsed = now - liveStartTime;
  if (elapsed > 0) {
    const hz = liveCount / (elapsed / 1000);
    hzEstimate.textContent = hz.toFixed(1);
  }
  liveSamples.textContent = String(liveCount);

  if (!isRecording) return;

  const sample = {
    t_ms: now,
    acc: toVector(event.acceleration, ["x", "y", "z"]),
    acc_g: toVector(event.accelerationIncludingGravity, ["x", "y", "z"]),
    rot: toVector(event.rotationRate, ["alpha", "beta", "gamma"]),
    ori: latestOrientation
      ? {
          alpha: latestOrientation.alpha,
          beta: latestOrientation.beta,
          gamma: latestOrientation.gamma,
        }
      : null,
    interval_ms:
      typeof event.interval === "number" && Number.isFinite(event.interval)
        ? event.interval
        : null,
  };

  samples.push(sample);
}

function attachSensorListeners() {
  if (listenersAttached) return;
  window.addEventListener("deviceorientation", handleOrientation);
  window.addEventListener("devicemotion", handleMotion);
  listenersAttached = true;
}

async function enableSensors() {
  sensorWarnings.textContent = "";

  if (typeof DeviceMotionEvent === "undefined") {
    sensorsSupported = false;
    sensorWarnings.textContent = "Motion sensors not supported in this browser/device.";
    updateSensorBadge();
    updateButtons();
    throw new Error("DeviceMotionEvent not supported in this browser");
  }

  setStatus("Requesting motion permission…");
  sensorStatus.textContent = "Requesting permission…";

  if (typeof DeviceMotionEvent.requestPermission === "function") {
    const perm = await DeviceMotionEvent.requestPermission();
    if (perm !== "granted") {
      sensorWarnings.textContent = "Permission denied. Tap the button after allowing motion access.";
      throw new Error("Motion permission denied");
    }
  }

  if (
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    try {
      await DeviceOrientationEvent.requestPermission();
    } catch (err) {
      // Orientation permission may not be required; ignore errors here.
    }
  }

  sensorsEnabled = true;
  liveCount = 0;
  liveStartTime = 0;
  attachSensorListeners();
  updateSensorBadge();
  updateButtons();
  sensorStatus.textContent = "Sensors enabled";
  setStatus("Sensors enabled");
}

async function startRecording() {
  if (!sessionId) {
    throw new Error("Start a session first");
  }
  if (!sensorsEnabled) {
    throw new Error("Enable motion sensors first");
  }
   if (!sensorsSupported) {
    throw new Error("Sensors unsupported on this device");
  }
  isRecording = true;
  samples = [];
  recordStart = performance.now();
  recordSummary.textContent = "Recording… move the device for 5–10s.";
  updateRecordBadge();
  updateButtons();
  setStatus("Recording");
}

function computeDiagnostics(tEnd) {
  const sampleCount = samples.length;
  const durationMs = tEnd - recordStart;
  const effectiveHz =
    durationMs > 0 ? Number((sampleCount / (durationMs / 1000)).toFixed(2)) : 0;
  const missing = { acc: 0, acc_g: 0, rot: 0, ori: 0 };
  samples.forEach((s) => {
    if (!s.acc) missing.acc += 1;
    if (!s.acc_g) missing.acc_g += 1;
    if (!s.rot) missing.rot += 1;
    if (!s.ori) missing.ori += 1;
  });
  return {
    sample_count: sampleCount,
    duration_ms: Number(durationMs.toFixed(2)),
    effective_hz: effectiveHz,
    missing,
  };
}

async function stopRecordingAndSubmit() {
  if (!isRecording) {
    throw new Error("Not recording");
  }
  isRecording = false;
  const tEnd = performance.now();
  const diagnostics = computeDiagnostics(tEnd);

  if (diagnostics.sample_count === 0) {
    recordSummary.textContent =
      "No samples captured; check permissions or try again with more motion.";
    setStatus("No samples");
    updateRecordBadge();
    updateButtons();
    return;
  }

  const trial = {
    trial_id: uuid(),
    trial_index: 0,
    stimulus_id: "live_capture",
    t_start_perf_ms: recordStart,
    t_end_perf_ms: tEnd,
    diagnostics,
    survey: {
      tags: ["live"],
      confidence: 5,
      notes: "Recorded on-device.",
    },
    samples: samples.slice(),
  };

  currentTrial = trial;
  updateTrialBadge();
  updateRecordBadge();
  updateButtons();

  recordSummary.textContent = JSON.stringify(
    {
      trial_id: trial.trial_id,
      samples: diagnostics.sample_count,
      duration_ms: diagnostics.duration_ms,
      effective_hz: diagnostics.effective_hz,
      missing: diagnostics.missing,
    },
    null,
    2
  );

  try {
    const json = await submitTrial();
    setStatus("Trial submitted");
    setOutput(json);
  } catch (err) {
    setStatus("Error");
    setOutput(String(err?.message ?? err));
  }
}

async function submitTrial() {
  if (!sessionId) {
    throw new Error("No session_id—start session first");
  }
  if (!currentTrial) {
    throw new Error("No trial data—run dummy or record first");
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

enableSensorsBtn.addEventListener("click", async () => {
  try {
    await enableSensors();
  } catch (err) {
    sensorStatus.textContent = "Failed to enable sensors";
    setStatus("Error");
    setOutput(String(err?.message ?? err));
  }
});

startRecordBtn.addEventListener("click", async () => {
  try {
    await startRecording();
  } catch (err) {
    setStatus("Error");
    setOutput(String(err?.message ?? err));
  }
});

stopRecordBtn.addEventListener("click", async () => {
  try {
    await stopRecordingAndSubmit();
  } catch (err) {
    setStatus("Error");
    setOutput(String(err?.message ?? err));
  }
});

updateSessionBadge();
updateTrialBadge();
updateSensorBadge();
updateRecordBadge();
updateButtons();
setOutput("Waiting to start session…");
