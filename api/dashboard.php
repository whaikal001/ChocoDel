<?php
/**
 * ChocoDel — Dashboard data API.
 *
 * One ?action=summary call returns everything the dashboard draws:
 *   - headline KPIs (revenue, orders, unpaid money, stock alerts)
 *   - 6-month sales line (Chart.js)
 *   - revenue by category (Chart.js)
 *   - top sellers by units
 *   - flash messages waiting in the session
 */

require_once __DIR__ . '/helpers.php';

if (action() !== 'summary') {
    fail('Unknown dashboard action.', 404);
}

$pdo = db();

/* ---- Headline KPIs ---------------------------------------------------- */
$kpi = $pdo->query(
    "SELECT
        COALESCE(SUM(CASE WHEN status='paid'   THEN total END),0) AS paid_revenue,
        COALESCE(SUM(CASE WHEN status='unpaid' THEN total END),0) AS unpaid_value,
        COUNT(*)                                                   AS order_count,
        SUM(CASE WHEN status='unpaid' THEN 1 ELSE 0 END)          AS unpaid_count
     FROM orders"
)->fetch();

$customerCount = (int) $pdo->query('SELECT COUNT(*) FROM customers')->fetchColumn();

$stockAlerts = $pdo->query(
    'SELECT
        SUM(CASE WHEN stock_qty <= 0 THEN 1 ELSE 0 END)                                  AS out_count,
        SUM(CASE WHEN stock_qty > 0 AND stock_qty <= reorder_level THEN 1 ELSE 0 END)    AS low_count
     FROM products'
)->fetch();

/* ---- Sales over the last 6 calendar months --------------------------- */
$months = [];
$labels = [];
$cursor = new DateTime('first day of this month');
for ($i = 5; $i >= 0; $i--) {
    $m = (clone $cursor)->modify("-$i month");
    $key = $m->format('Y-m');
    $months[$key] = 0.0;
    $labels[$key] = $m->format('M Y');
}

$salesStmt = $pdo->query(
    "SELECT DATE_FORMAT(order_date, '%Y-%m') AS ym, SUM(total) AS revenue
     FROM orders
     WHERE status = 'paid'
     GROUP BY ym"
);
foreach ($salesStmt->fetchAll() as $row) {
    if (isset($months[$row['ym']])) {
        $months[$row['ym']] = (float) $row['revenue'];
    }
}

/* ---- Revenue by product category ------------------------------------- */
$catStmt = $pdo->query(
    "SELECT p.category, SUM(oi.line_total) AS revenue
     FROM order_items oi
     JOIN orders o   ON o.id = oi.order_id AND o.status = 'paid'
     JOIN products p ON p.id = oi.product_id
     GROUP BY p.category
     ORDER BY revenue DESC"
);
$categories = [];
foreach ($catStmt->fetchAll() as $row) {
    $categories[] = ['label' => $row['category'], 'value' => round((float) $row['revenue'], 2)];
}

/* ---- Top sellers by units sold --------------------------------------- */
$topStmt = $pdo->query(
    "SELECT oi.product_name, SUM(oi.quantity) AS units, SUM(oi.line_total) AS revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id AND o.status = 'paid'
     GROUP BY oi.product_name
     ORDER BY units DESC
     LIMIT 5"
);
$topSellers = array_map(function ($r) {
    return [
        'name'    => $r['product_name'],
        'units'   => (int) $r['units'],
        'revenue' => round((float) $r['revenue'], 2),
    ];
}, $topStmt->fetchAll());

send([
    'kpi' => [
        'paid_revenue'   => round((float) $kpi['paid_revenue'], 2),
        'unpaid_value'   => round((float) $kpi['unpaid_value'], 2),
        'order_count'    => (int) $kpi['order_count'],
        'unpaid_count'   => (int) $kpi['unpaid_count'],
        'customer_count' => $customerCount,
        'out_count'      => (int) $stockAlerts['out_count'],
        'low_count'      => (int) $stockAlerts['low_count'],
    ],
    'sales' => [
        'labels' => array_values($labels),
        'values' => array_map(fn ($v) => round($v, 2), array_values($months)),
    ],
    'categories' => $categories,
    'top_sellers' => $topSellers,
    'flash'       => take_flash(),
]);
