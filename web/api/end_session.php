<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

$body = api_read_json_body();
$sessionId = is_string($body['session_id'] ?? null) ? $body['session_id'] : null;

if ($sessionId === null) {
    api_error(400, 'session_id is required');
}

$pdo = api_pdo();
$stmt = $pdo->prepare('UPDATE sessions SET completed_at = NOW() WHERE id = :id');
$stmt->execute([':id' => $sessionId]);

if ($stmt->rowCount() === 0) {
    api_error(404, 'Unknown session_id');
}

api_json_response(200, [
    'ok' => true,
    'session_id' => $sessionId,
    'completed_at' => (new DateTimeImmutable('now'))->format(DateTimeInterface::ATOM),
]);
