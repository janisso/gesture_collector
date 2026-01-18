<?php
declare(strict_types=1);

return [
    'db' => [
        'dsn' => 'mysql:host=mysql;dbname=gesture_study;charset=utf8mb4',
        'user' => 'root',
        'password' => 'rootpass',
        'options' => [],
    ],
    'admin' => [
        // Set a strong token; required by admin/export.php via X-Admin-Token header.
        'token' => 'change-me',
    ],
];
