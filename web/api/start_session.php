<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

$body = api_read_json_body();

$studyId = is_string($body['study_id'] ?? null) ? $body['study_id'] : 'unknown';
$studyVersion = is_string($body['study_version'] ?? null) ? $body['study_version'] : 'unknown';
$schemaVersion = is_int($body['schema_version'] ?? null) ? $body['schema_version'] : 1;
$consentVersion = is_string($body['consent_version'] ?? null) ? $body['consent_version'] : 'unknown';

$sessionId = api_uuid_v4();

api_json_response(200, [
    'ok' => true,
    'session_id' => $sessionId,
    'study_id' => $studyId,
    'study_version' => $studyVersion,
    'schema_version' => $schemaVersion,
    'consent_version' => $consentVersion,
    'config' => [
        'target_hz' => 100,
        'min_hz' => 60,
        'trials' => [],
    ],
]);

