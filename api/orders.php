<?php
/**
 * ChocoDel — Orders API.
 *
 * Actions:
 *   list      GET   all orders (newest first) + LIKE search by customer/id
 *   get       GET   one order with its line items
 *   markpaid  POST  flip an unpaid order to paid
 *   delete    POST  void an order and return the stock
 *
 * Unpaid orders are flagged so the dashboard / list can warn about money
 * still owed.
 */

require_once __DIR__ . '/helpers.php';

switch (action()) {

    /* ---------------------------------------------------------------- */
    case 'list': {
        $q = trim($_GET['q'] ?? '');
        if (isset($_GET['q'])) {
            $_SESSION['last_order_query'] = $q;
        }

        $sql = 'SELECT o.*, c.name AS customer_name,
                       (SELECT COALESCE(SUM(quantity),0) FROM order_items WHERE order_id = o.id) AS item_count
                FROM orders o
                JOIN customers c ON c.id = o.customer_id';
        $params = [];

        if ($q !== '') {
            // Search by customer name or by order number (#12 or 12).
            $sql .= ' WHERE c.name LIKE :term OR o.id = :idterm';
            $params[':term']   = '%' . $q . '%';
            $params[':idterm'] = (int) ltrim($q, '#');
        }
        $sql .= ' ORDER BY o.order_date DESC, o.id DESC';

        $stmt = db()->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $unpaidCount = 0;
        $unpaidValue = 0.0;
        foreach ($rows as &$r) {
            $r['subtotal']   = (float) $r['subtotal'];
            $r['discount']   = (float) $r['discount'];
            $r['tax']        = (float) $r['tax'];
            $r['total']      = (float) $r['total'];
            $r['item_count'] = (int) $r['item_count'];
            if ($r['status'] === 'unpaid') {
                $unpaidCount++;
                $unpaidValue += $r['total'];
            }
        }
        unset($r);

        send([
            'orders'       => $rows,
            'last_query'   => $_SESSION['last_order_query'] ?? '',
            'count'        => count($rows),
            'unpaid_count' => $unpaidCount,
            'unpaid_value' => round($unpaidValue, 2),
        ]);
    }

    /* ---------------------------------------------------------------- */
    case 'get': {
        $id = (int) ($_GET['id'] ?? 0);

        $head = db()->prepare(
            'SELECT o.*, c.name AS customer_name, c.email, c.phone, c.address
             FROM orders o JOIN customers c ON c.id = o.customer_id
             WHERE o.id = :id'
        );
        $head->execute([':id' => $id]);
        $order = $head->fetch();
        if (!$order) {
            fail('Order not found.', 404);
        }

        $lines = db()->prepare('SELECT * FROM order_items WHERE order_id = :id ORDER BY id');
        $lines->execute([':id' => $id]);

        foreach (['subtotal', 'discount', 'tax', 'total'] as $k) {
            $order[$k] = (float) $order[$k];
        }
        $items = array_map(function ($l) {
            $l['unit_price'] = (float) $l['unit_price'];
            $l['line_total'] = (float) $l['line_total'];
            $l['quantity']   = (int) $l['quantity'];
            return $l;
        }, $lines->fetchAll());

        send(['order' => $order, 'items' => $items]);
    }

    /* ---------------------------------------------------------------- */
    case 'markpaid': {
        $d  = body();
        $id = (int) ($d['id'] ?? 0);

        $stmt = db()->prepare("UPDATE orders SET status = 'paid' WHERE id = :id AND status = 'unpaid'");
        $stmt->execute([':id' => $id]);

        if ($stmt->rowCount() === 0) {
            fail('That order is already paid (or does not exist).');
        }
        flash('success', 'Order #' . $id . ' marked as paid.');
        send(['id' => $id]);
    }

    /* ---------------------------------------------------------------- */
    case 'delete': {
        $d  = body();
        $id = (int) ($d['id'] ?? 0);

        $pdo = db();
        $pdo->beginTransaction();
        try {
            // Return the stock that was taken when the order was placed.
            $items = $pdo->prepare('SELECT product_id, quantity FROM order_items WHERE order_id = :id');
            $items->execute([':id' => $id]);
            $restock = $pdo->prepare('UPDATE products SET stock_qty = stock_qty + :qty WHERE id = :pid');
            foreach ($items->fetchAll() as $it) {
                $restock->execute([':qty' => (int) $it['quantity'], ':pid' => (int) $it['product_id']]);
            }

            // order_items rows cascade-delete with the order.
            $del = $pdo->prepare('DELETE FROM orders WHERE id = :id');
            $del->execute([':id' => $id]);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            fail('Could not void the order: ' . $e->getMessage());
        }

        flash('info', 'Order #' . $id . ' voided and stock returned.');
        send(['id' => $id]);
    }

    /* ---------------------------------------------------------------- */
    default:
        fail('Unknown order action.', 404);
}
