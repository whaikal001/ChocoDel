<?php
/**
 * ChocoDel — Shopping cart API (session-backed).
 *
 * The cart lives in $_SESSION['cart'] as  product_id => quantity.
 * Every read re-prices the cart against the live products table so the
 * totals are always honest, and re-checks stock before showing the basket.
 *
 * Actions: get | add | setqty | remove | clear | checkout
 */

require_once __DIR__ . '/helpers.php';

/**
 * Build the full, priced cart view from the session + live product data.
 * Also surfaces any line where the requested qty exceeds stock.
 */
function cart_view(): array
{
    $cart = $_SESSION['cart'] ?? [];
    if (!$cart) {
        $b = price_breakdown(0);
        return [
            'items'    => [],
            'count'    => 0,
            'warnings' => [],
        ] + $b;
    }

    // Pull every product that's in the cart in one prepared statement.
    $ids   = array_keys($cart);
    $place = implode(',', array_fill(0, count($ids), '?'));
    $stmt  = db()->prepare("SELECT * FROM products WHERE id IN ($place)");
    $stmt->execute($ids);
    $products = [];
    foreach ($stmt->fetchAll() as $p) {
        $products[(int) $p['id']] = $p;
    }

    $items    = [];
    $warnings = [];
    $subtotal = 0.0;

    foreach ($cart as $pid => $qty) {
        if (!isset($products[$pid])) {
            continue; // product was deleted — silently drop it
        }
        $p         = $products[$pid];
        $qty       = (int) $qty;
        $price     = (float) $p['price'];
        $lineTotal = round($price * $qty, 2);
        $subtotal += $lineTotal;

        if ($qty > (int) $p['stock_qty']) {
            $warnings[] = 'Only ' . (int) $p['stock_qty'] . ' of “' . $p['name'] . '” in stock — you have ' . $qty . ' in the cart.';
        }

        $items[] = [
            'product_id' => (int) $pid,
            'name'       => $p['name'],
            'sku'        => $p['sku'],
            'unit_price' => $price,
            'quantity'   => $qty,
            'stock_qty'  => (int) $p['stock_qty'],
            'line_total' => $lineTotal,
        ];
    }

    return array_merge(
        [
            'items'    => $items,
            'count'    => array_sum(array_column($items, 'quantity')),
            'warnings' => $warnings,
        ],
        price_breakdown($subtotal)
    );
}

switch (action()) {

    /* ---------------------------------------------------------------- */
    case 'get':
        send(['cart' => cart_view()]);

    /* ---------------------------------------------------------------- */
    case 'add': {
        $d   = body();
        $pid = (int) ($d['product_id'] ?? 0);
        $qty = max(1, (int) ($d['quantity'] ?? 1));

        $stmt = db()->prepare('SELECT name, stock_qty FROM products WHERE id = :id');
        $stmt->execute([':id' => $pid]);
        $product = $stmt->fetch();
        if (!$product) {
            fail('That product no longer exists.', 404);
        }
        if ((int) $product['stock_qty'] <= 0) {
            fail('“' . $product['name'] . '” is out of stock.');
        }

        $_SESSION['cart'][$pid] = ($_SESSION['cart'][$pid] ?? 0) + $qty;
        send(['cart' => cart_view(), 'added' => $product['name']]);
    }

    /* ---------------------------------------------------------------- */
    case 'setqty': {
        $d   = body();
        $pid = (int) ($d['product_id'] ?? 0);
        $qty = (int) ($d['quantity'] ?? 0);

        if ($qty <= 0) {
            unset($_SESSION['cart'][$pid]);
        } else {
            $_SESSION['cart'][$pid] = $qty;
        }
        send(['cart' => cart_view()]);
    }

    /* ---------------------------------------------------------------- */
    case 'remove': {
        $d = body();
        unset($_SESSION['cart'][(int) ($d['product_id'] ?? 0)]);
        send(['cart' => cart_view()]);
    }

    /* ---------------------------------------------------------------- */
    case 'clear':
        unset($_SESSION['cart']);
        send(['cart' => cart_view()]);

    /* ---------------------------------------------------------------- */
    case 'checkout': {
        $d          = body();
        $customerId = (int) ($d['customer_id'] ?? 0);
        $status     = ($d['status'] ?? 'unpaid') === 'paid' ? 'paid' : 'unpaid';
        $note       = trim($d['note'] ?? '');

        $cart = $_SESSION['cart'] ?? [];
        if (!$cart) {
            fail('Your cart is empty.');
        }

        $custStmt = db()->prepare('SELECT id FROM customers WHERE id = :id');
        $custStmt->execute([':id' => $customerId]);
        if (!$custStmt->fetch()) {
            fail('Please choose a customer for this order.');
        }

        $pdo = db();
        $pdo->beginTransaction();
        try {
            // Lock + re-read every product so we price and stock-check atomically.
            $ids   = array_keys($cart);
            $place = implode(',', array_fill(0, count($ids), '?'));
            $stmt  = $pdo->prepare("SELECT * FROM products WHERE id IN ($place) FOR UPDATE");
            $stmt->execute($ids);
            $products = [];
            foreach ($stmt->fetchAll() as $p) {
                $products[(int) $p['id']] = $p;
            }

            $lines    = [];
            $subtotal = 0.0;
            foreach ($cart as $pid => $qty) {
                if (!isset($products[$pid])) {
                    throw new RuntimeException('A product in your cart no longer exists.');
                }
                $p = $products[$pid];
                if ($qty > (int) $p['stock_qty']) {
                    throw new RuntimeException('Not enough stock of “' . $p['name'] . '”. Only ' . (int) $p['stock_qty'] . ' left.');
                }
                $lineTotal = round((float) $p['price'] * $qty, 2);
                $subtotal += $lineTotal;
                $lines[] = [
                    'product_id' => (int) $pid,
                    'name'       => $p['name'],
                    'unit_price' => (float) $p['price'],
                    'quantity'   => (int) $qty,
                    'line_total' => $lineTotal,
                ];
            }

            $money = price_breakdown($subtotal);

            // Header
            $ins = $pdo->prepare(
                'INSERT INTO orders (customer_id, subtotal, discount, tax, total, status, note)
                 VALUES (:customer_id, :subtotal, :discount, :tax, :total, :status, :note)'
            );
            $ins->execute([
                ':customer_id' => $customerId,
                ':subtotal'    => $money['subtotal'],
                ':discount'    => $money['discount'],
                ':tax'         => $money['tax'],
                ':total'       => $money['total'],
                ':status'      => $status,
                ':note'        => $note,
            ]);
            $orderId = (int) $pdo->lastInsertId();

            // Lines + stock deduction
            $insItem = $pdo->prepare(
                'INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, line_total)
                 VALUES (:order_id, :product_id, :product_name, :unit_price, :quantity, :line_total)'
            );
            $deduct = $pdo->prepare('UPDATE products SET stock_qty = stock_qty - :qty WHERE id = :id');

            foreach ($lines as $ln) {
                $insItem->execute([
                    ':order_id'     => $orderId,
                    ':product_id'   => $ln['product_id'],
                    ':product_name' => $ln['name'],
                    ':unit_price'   => $ln['unit_price'],
                    ':quantity'     => $ln['quantity'],
                    ':line_total'   => $ln['line_total'],
                ]);
                $deduct->execute([':qty' => $ln['quantity'], ':id' => $ln['product_id']]);
            }

            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            fail($e->getMessage());
        }

        unset($_SESSION['cart']);
        flash('success', 'Order #' . $orderId . ' placed — RM' . number_format($money['total'], 2) . ($status === 'unpaid' ? ' (marked unpaid).' : ' (paid).'));
        send(['order_id' => $orderId, 'totals' => $money], 201);
    }

    /* ---------------------------------------------------------------- */
    default:
        fail('Unknown cart action.', 404);
}
