<?php
/**
 * ChocoDel — shared request helpers.
 *
 * Handles the PHP-session layer, JSON in/out, and flash messages.
 * Pulled in by every API endpoint.
 */

require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

/* -------------------------------------------------------------------------
 *  Business rules (single source of truth — JS mirrors these for preview,
 *  but the server is always the authority on the saved numbers).
 * ---------------------------------------------------------------------- */
const DISCOUNT_THRESHOLD = 500.00; // spend this much (RM) to unlock a discount
const DISCOUNT_RATE      = 0.05;   // 5% off the subtotal
const SST_RATE           = 0.06;   // 6% Malaysian SST

/**
 * Work out the money for a basket subtotal.
 * Returns an array of subtotal / discount / tax / total, all rounded to 2dp.
 */
function price_breakdown(float $subtotal): array
{
    $discount = $subtotal >= DISCOUNT_THRESHOLD ? round($subtotal * DISCOUNT_RATE, 2) : 0.00;
    $taxable  = $subtotal - $discount;
    $tax      = round($taxable * SST_RATE, 2);
    $total    = round($taxable + $tax, 2);

    return [
        'subtotal' => round($subtotal, 2),
        'discount' => $discount,
        'tax'      => $tax,
        'total'    => $total,
    ];
}

/* -------------------------------------------------------------------------
 *  JSON plumbing
 * ---------------------------------------------------------------------- */

/** Send a JSON success payload and stop. */
function send(array $data = [], int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['ok' => true], $data));
    exit;
}

/** Send a JSON error payload and stop. */
function fail(string $message, int $code = 400): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => $message]);
    exit;
}

/** Read the JSON body of a POST request into an associative array. */
function body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/** Which action is being asked for? (?action=... on the query string). */
function action(): string
{
    return $_GET['action'] ?? '';
}

/* -------------------------------------------------------------------------
 *  Flash messages (survive one redirect via the session)
 * ---------------------------------------------------------------------- */

/** Queue a flash message. type = success | warning | danger | info. */
function flash(string $type, string $text): void
{
    $_SESSION['flash'][] = ['type' => $type, 'text' => $text];
}

/** Pull and clear all queued flash messages. */
function take_flash(): array
{
    $messages = $_SESSION['flash'] ?? [];
    unset($_SESSION['flash']);
    return $messages;
}
