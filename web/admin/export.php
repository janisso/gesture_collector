<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/db.php';

$configPath = __DIR__ . '/../api/config.php';
$config = file_exists($configPath) ? require $configPath : [];
$adminToken = $config['admin']['token'] ?? null;

function admin_error(int $status, string $message): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_SLASHES);
    exit;
}

if (!is_string($adminToken) || $adminToken === '') {
    admin_error(500, 'Admin token not configured.');
}

$providedToken = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
if (!hash_equals($adminToken, $providedToken)) {
    admin_error(401, 'Unauthorized');
}

$studyId = isset($_GET['study_id']) && is_string($_GET['study_id']) ? trim($_GET['study_id']) : '';
$studyVersion = isset($_GET['study_version']) && is_string($_GET['study_version']) ? trim($_GET['study_version']) : null;

if ($studyId === '') {
    admin_error(400, 'study_id is required');
}

$pdo = api_pdo();

$sql = 'SELECT * FROM trials WHERE study_id = :study_id';
$params = [':study_id' => $studyId];

if ($studyVersion !== null && $studyVersion !== '') {
    $sql .= ' AND study_version = :study_version';
    $params[':study_version'] = $studyVersion;
}

$sql .= ' ORDER BY created_at ASC';

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (!$rows) {
    admin_error(404, 'No trials found for the given study_id/study_version');
}

$tmpFile = tempnam(sys_get_temp_dir(), 'export_zip_');
$zip = new ZipArchive();

if ($zip->open($tmpFile, ZipArchive::OVERWRITE) !== true) {
    admin_error(500, 'Failed to create zip');
}

foreach ($rows as $row) {
    $trial = [
        'schema_version' => (int) $row['schema_version'],
        'study_id' => $row['study_id'],
        'study_version' => $row['study_version'],
        'session_id' => $row['session_id'],
        'trial_id' => $row['id'],
        'trial_index' => (int) $row['trial_index'],
        'stimulus_id' => $row['stimulus_id'],
        't_start_perf_ms' => (float) $row['t_start_perf_ms'],
        't_end_perf_ms' => (float) $row['t_end_perf_ms'],
        'duration_ms' => (float) $row['duration_ms'],
        'sample_count' => (int) $row['sample_count'],
        'effective_hz' => (float) $row['effective_hz'],
        'survey' => json_decode((string) $row['survey_json'], true) ?? null,
        'diagnostics' => json_decode((string) $row['diagnostics_json'], true) ?? null,
        'samples' => json_decode((string) $row['samples_json'], true) ?? [],
        'created_at' => $row['created_at'],
    ];

    $json = json_encode($trial, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        continue;
    }

    $zip->addFromString('trial_' . $row['id'] . '.json', $json);
}

$zip->close();

$filename = 'trials_' . $studyId;
if ($studyVersion) {
    $filename .= '_' . $studyVersion;
}
$filename .= '.zip';

header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Content-Length: ' . filesize($tmpFile));

readfile($tmpFile);
@unlink($tmpFile);
exit;
