<?php
/**
 * ChocoDel — database connection (PDO).
 *
 * Defaults match a standard XAMPP / WAMP install (MySQL on localhost,
 * user "root", empty password). Change these if your setup differs.
 *
 * Every query in this project goes through PDO prepared statements.
 */

const DB_HOST = '127.0.0.1';
const DB_NAME = 'chocodel';
const DB_USER = 'root';
const DB_PASS = '';
const DB_CHARSET = 'utf8mb4';

/**
 * Returns a shared PDO connection (one per request).
 */
function db(): PDO
{
    static $pdo = null;

    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];

        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode([
                'ok'    => false,
                'error' => 'Database connection failed. Is MySQL running and has chocodel.sql been imported?',
            ]);
            exit;
        }
    }

    return $pdo;
}
