<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

$body = api_read_json_body();

$studyId = is_string($body['study_id'] ?? null) ? $body['study_id'] : 'unknown';
$studyVersion = is_string($body['study_version'] ?? null) ? $body['study_version'] : 'unknown';
$schemaVersion = is_numeric($body['schema_version'] ?? null) ? (int) $body['schema_version'] : 1;
$consentVersion = is_string($body['consent_version'] ?? null) ? $body['consent_version'] : 'unknown';
$capabilities = $body['capabilities'] ?? null;
$metadata = $body['metadata'] ?? null;
$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';

$sessionId = api_uuid_v4();

$pdo = api_pdo();

$stmt = $pdo->prepare(
    'INSERT INTO sessions (id, study_id, study_version, schema_version, consent_version, user_agent, capabilities_json, metadata_json)
     VALUES (:id, :study_id, :study_version, :schema_version, :consent_version, :user_agent, :capabilities_json, :metadata_json)'
);

$stmt->execute([
    ':id' => $sessionId,
    ':study_id' => $studyId,
    ':study_version' => $studyVersion,
    ':schema_version' => $schemaVersion,
    ':consent_version' => $consentVersion,
    ':user_agent' => $userAgent,
    ':capabilities_json' => is_array($capabilities) ? api_json_string($capabilities) : null,
    ':metadata_json' => is_array($metadata) ? api_json_string($metadata) : null,
]);

$config = [
    'target_hz' => 100,
    'min_hz' => 60,
    'trials' => [],
];

api_json_response(200, [
    'ok' => true,
    'session_id' => $sessionId,
    'study_id' => $studyId,
    'study_version' => $studyVersion,
    'schema_version' => $schemaVersion,
    'consent_version' => $consentVersion,
    'config' => $config,
]);
