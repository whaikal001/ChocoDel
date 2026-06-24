<?php
/**
 * ChocoDel — rule-based insights engine.
 *
 * This is the "AI insights" feature: a transparent rules engine that looks
 * at each product's recent sales velocity vs its current stock and reorder
 * level, then writes a plain-English recommendation. No black box — every
 * suggestion shows the reasoning that produced it.
 *
 * Action: ?action=restock
 */

require_once __DIR__ . '/helpers.php';

if (action() !== 'restock') {
    fail('Unknown insights action.', 404);
}

const LOOKBACK_DAYS   = 60;   // window we measure demand over
const COVERAGE_WEEKS  = 4;    // how many weeks of stock we want to keep on hand

$pdo = db();

// Units sold per product within the lookback window (paid orders only).
$velStmt = $pdo->prepare(
    "SELECT oi.product_id, SUM(oi.quantity) AS units
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id AND o.status = 'paid'
     WHERE o.order_date >= (NOW() - INTERVAL :days DAY)
     GROUP BY oi.product_id"
);
$velStmt->execute([':days' => LOOKBACK_DAYS]);
$sold = [];
foreach ($velStmt->fetchAll() as $r) {
    $sold[(int) $r['product_id']] = (int) $r['units'];
}

$products = $pdo->query('SELECT * FROM products ORDER BY name')->fetchAll();

$recommendations = [];
$counts = ['urgent' => 0, 'soon' => 0, 'watch' => 0, 'slow' => 0, 'ok' => 0];

foreach ($products as $p) {
    $id    = (int) $p['id'];
    $stock = (int) $p['stock_qty'];
    $level = (int) $p['reorder_level'];
    $units = $sold[$id] ?? 0;

    // Demand, normalised to a per-week rate.
    $perWeek   = round($units / (LOOKBACK_DAYS / 7), 1);
    $daysLeft  = $perWeek > 0 ? (int) floor($stock / ($perWeek / 7)) : null;

    // Target stock = enough to cover COVERAGE_WEEKS of demand, but never
    // below twice the reorder level for anything that sells at all.
    $target    = (int) ceil($perWeek * COVERAGE_WEEKS);
    if ($units > 0) {
        $target = max($target, $level * 2);
    }
    $suggestQty = max(0, $target - $stock);

    /* ---- classify ------------------------------------------------- */
    if ($stock <= 0 && $units > 0) {
        $level_key = 'urgent';
        $headline  = 'Out of stock — and it sells. Reorder now.';
        $reason    = "Sold {$units} units in the last " . LOOKBACK_DAYS . " days but stock is zero. Every day out is a lost sale.";
    } elseif ($stock <= 0) {
        $level_key = 'watch';
        $headline  = 'Out of stock (no recent demand).';
        $reason    = 'Stock is zero but nothing has sold lately — restock only if you still list it.';
        $suggestQty = max($suggestQty, $level);
    } elseif ($daysLeft !== null && $daysLeft <= 7) {
        $level_key = 'urgent';
        $headline  = "About {$daysLeft} days of stock left.";
        $reason    = "Selling ~{$perWeek}/week with only {$stock} on hand — you’ll run out within a week.";
    } elseif ($stock <= $level) {
        $level_key = 'soon';
        $headline  = 'Below reorder level.';
        $reason    = "Stock ({$stock}) is at or under the reorder line ({$level}). Demand is ~{$perWeek}/week.";
    } elseif ($daysLeft !== null && $daysLeft <= 21) {
        $level_key = 'watch';
        $headline  = "Roughly {$daysLeft} days of cover left.";
        $reason    = "Steady demand of ~{$perWeek}/week. Plan a reorder in the next couple of weeks.";
    } elseif ($units === 0 && $stock > $level * 2) {
        $level_key = 'slow';
        $headline  = 'Slow mover — capital tied up.';
        $reason    = "No sales in " . LOOKBACK_DAYS . " days but {$stock} units sitting in stock. Consider a bundle or promo.";
        $suggestQty = 0;
    } else {
        $level_key = 'ok';
        $headline  = 'Healthy.';
        $reason    = $perWeek > 0
            ? "~{$perWeek}/week and {$stock} in stock — comfortable cover."
            : "Stock at {$stock}, no recent sales pressure.";
        $suggestQty = 0;
    }

    $counts[$level_key]++;

    $recommendations[] = [
        'product_id'   => $id,
        'name'         => $p['name'],
        'sku'          => $p['sku'],
        'category'     => $p['category'],
        'stock_qty'    => $stock,
        'reorder_level'=> $level,
        'units_sold'   => $units,
        'per_week'     => $perWeek,
        'days_left'    => $daysLeft,
        'level'        => $level_key,
        'headline'     => $headline,
        'reason'       => $reason,
        'suggest_qty'  => $suggestQty,
    ];
}

// Sort by urgency, then by how much we'd reorder.
$order = ['urgent' => 0, 'soon' => 1, 'watch' => 2, 'slow' => 3, 'ok' => 4];
usort($recommendations, function ($a, $b) use ($order) {
    if ($order[$a['level']] !== $order[$b['level']]) {
        return $order[$a['level']] <=> $order[$b['level']];
    }
    return $b['suggest_qty'] <=> $a['suggest_qty'];
});

// A one-line natural summary for the top of the page.
$bits = [];
if ($counts['urgent']) $bits[] = $counts['urgent'] . ' need reordering now';
if ($counts['soon'])   $bits[] = $counts['soon'] . ' below reorder level';
if ($counts['watch'])  $bits[] = $counts['watch'] . ' to watch';
if ($counts['slow'])   $bits[] = $counts['slow'] . ' slow movers';
$summary = $bits
    ? 'Across your catalogue: ' . implode(', ', $bits) . '.'
    : 'Everything looks well stocked — nothing needs action right now.';

send([
    'summary'         => $summary,
    'counts'          => $counts,
    'lookback_days'   => LOOKBACK_DAYS,
    'recommendations' => $recommendations,
]);
