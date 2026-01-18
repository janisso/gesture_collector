<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

api_require_post();
$body = api_read_json_body();

$sessionId = is_string($body['session_id'] ?? null) ? trim($body['session_id']) : '';
if ($sessionId === '') {
    api_error(400, 'session_id is required');
}

$trialId = is_string($body['trial_id'] ?? null) ? trim($body['trial_id']) : '';
if ($trialId === '') {
    $trialId = api_uuid_v4();
}

$studyId = is_string($body['study_id'] ?? null) ? trim($body['study_id']) : 'unknown';
$studyVersion = is_string($body['study_version'] ?? null) ? trim($body['study_version']) : 'unknown';
$schemaVersion = is_numeric($body['schema_version'] ?? null) ? (int) $body['schema_version'] : 1;
$trialIndex = is_numeric($body['trial_index'] ?? null) ? (int) $body['trial_index'] : 0;
$stimulusId = is_string($body['stimulus_id'] ?? null) ? trim($body['stimulus_id']) : null;
if ($stimulusId === '') {
    $stimulusId = null;
}

$tStart = is_numeric($body['t_start_perf_ms'] ?? null) ? (float) $body['t_start_perf_ms'] : 0.0;
$tEnd = is_numeric($body['t_end_perf_ms'] ?? null) ? (float) $body['t_end_perf_ms'] : 0.0;

$survey = $body['survey'] ?? null;
$diagnostics = $body['diagnostics'] ?? null;
$samples = $body['samples'] ?? [];

$sampleCount = null;
if (is_array($diagnostics) && isset($diagnostics['sample_count']) && is_numeric($diagnostics['sample_count'])) {
    $sampleCount = (int) $diagnostics['sample_count'];
} elseif (is_array($samples)) {
    $sampleCount = count($samples);
} else {
    $sampleCount = 0;
}

$durationMs = null;
if (is_array($diagnostics) && isset($diagnostics['duration_ms']) && is_numeric($diagnostics['duration_ms'])) {
    $durationMs = (float) $diagnostics['duration_ms'];
} elseif ($tEnd > $tStart) {
    $durationMs = $tEnd - $tStart;
} else {
    $durationMs = 0.0;
}

$effectiveHz = null;
if (is_array($diagnostics) && isset($diagnostics['effective_hz']) && is_numeric($diagnostics['effective_hz'])) {
    $effectiveHz = (float) $diagnostics['effective_hz'];
} elseif ($durationMs > 0) {
    $effectiveHz = $sampleCount / ($durationMs / 1000);
} else {
    $effectiveHz = 0.0;
}

$pdo = api_pdo();

// Ensure session exists
$check = $pdo->prepare('SELECT 1 FROM sessions WHERE id = :id');
$check->execute([':id' => $sessionId]);
if ($check->fetchColumn() === false) {
    api_error(404, 'Unknown session_id');
}

$insert = $pdo->prepare(
    'INSERT INTO trials (
        id, session_id, study_id, study_version, schema_version,
        trial_index, stimulus_id, t_start_perf_ms, t_end_perf_ms,
        survey_json, diagnostics_json, samples_json,
        sample_count, duration_ms, effective_hz
    ) VALUES (
        :id, :session_id, :study_id, :study_version, :schema_version,
        :trial_index, :stimulus_id, :t_start_perf_ms, :t_end_perf_ms,
        :survey_json, :diagnostics_json, :samples_json,
        :sample_count, :duration_ms, :effective_hz
    )
    ON DUPLICATE KEY UPDATE session_id = session_id'
);

$insert->execute([
    ':id' => $trialId,
    ':session_id' => $sessionId,
    ':study_id' => $studyId,
    ':study_version' => $studyVersion,
    ':schema_version' => $schemaVersion,
    ':trial_index' => $trialIndex,
    ':stimulus_id' => $stimulusId,
    ':t_start_perf_ms' => $tStart,
    ':t_end_perf_ms' => $tEnd,
    ':survey_json' => is_array($survey) ? api_json_string($survey) : null,
    ':diagnostics_json' => is_array($diagnostics) ? api_json_string($diagnostics) : null,
    ':samples_json' => is_array($samples) ? api_json_string($samples) : api_json_string([]),
    ':sample_count' => $sampleCount,
    ':duration_ms' => $durationMs,
    ':effective_hz' => $effectiveHz,
]);

api_json_response(200, [
    'ok' => true,
    'trial_id' => $trialId,
    'session_id' => $sessionId,
    'sample_count' => $sampleCount,
    'duration_ms' => $durationMs,
    'effective_hz' => $effectiveHz,
]);
