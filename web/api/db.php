<?php
declare(strict_types=1);

function api_json_response(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function api_error(int $statusCode, string $message): void
{
    api_json_response($statusCode, ['ok' => false, 'error' => $message]);
}

function api_read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
        api_error(400, 'Invalid JSON body');
    }
    return $decoded;
}

function api_uuid_v4(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);
    return sprintf(
        '%s-%s-%s-%s-%s',
        substr($hex, 0, 8),
        substr($hex, 8, 4),
        substr($hex, 12, 4),
        substr($hex, 16, 4),
        substr($hex, 20, 12)
    );
}

function api_json_string($value): string
{
    $encoded = json_encode($value, JSON_UNESCAPED_SLASHES);
    return $encoded === false ? 'null' : $encoded;
}

function api_require_post(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        header('Allow: POST');
        api_error(405, 'POST required');
    }
}

function api_pdo(): PDO
{
    $configPath = __DIR__ . '/config.php';
    if (!file_exists($configPath)) {
        api_error(500, 'Missing config.php (copy config.example.php to config.php).');
    }

    $config = require $configPath;
    $dsn = $config['db']['dsn'] ?? '';
    $user = $config['db']['user'] ?? '';
    $password = $config['db']['password'] ?? '';
    $options = $config['db']['options'] ?? [];

    try {
        $pdo = new PDO($dsn, $user, $password, $options);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        return $pdo;
    } catch (Throwable $e) {
        api_error(500, 'DB connection failed.');
    }
}
