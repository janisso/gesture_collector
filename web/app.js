const output = document.getElementById("output");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startSessionBtn");

function setStatus(text) {
  statusEl.textContent = text;
}

function setOutput(value) {
  output.textContent =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

async function startSession() {
  setStatus("Starting…");
  setOutput("");

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

startBtn.addEventListener("click", async () => {
  try {
    const json = await startSession();
    setOutput(json);
    setStatus("OK");
  } catch (err) {
    setStatus("Error");
    setOutput(String(err?.message ?? err));
  }
});

