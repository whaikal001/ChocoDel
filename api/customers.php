<?php
/**
 * ChocoDel — Customers API.
 *
 * Actions: list (with LIKE search) | get | create | update | delete.
 * The list also carries each customer's order count + lifetime spend
 * so the UI can show who the regulars are.
 */

require_once __DIR__ . '/helpers.php';

switch (action()) {

    /* ---------------------------------------------------------------- */
    case 'list': {
        $q = trim($_GET['q'] ?? '');
        if (isset($_GET['q'])) {
            $_SESSION['last_customer_query'] = $q;
        }

        $sql = 'SELECT c.*,
                       COUNT(o.id)               AS order_count,
                       COALESCE(SUM(o.total), 0) AS lifetime_spend
                FROM customers c
                LEFT JOIN orders o ON o.customer_id = c.id';
        $params = [];

        if ($q !== '') {
            // Distinct placeholders — native prepares can't reuse one name.
            $term = '%' . $q . '%';
            $sql .= ' WHERE c.name LIKE :t1 OR c.email LIKE :t2 OR c.phone LIKE :t3';
            $params[':t1'] = $term;
            $params[':t2'] = $term;
            $params[':t3'] = $term;
        }
        $sql .= ' GROUP BY c.id ORDER BY c.name';

        $stmt = db()->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        foreach ($rows as &$r) {
            $r['order_count']    = (int) $r['order_count'];
            $r['lifetime_spend'] = (float) $r['lifetime_spend'];
        }
        unset($r);

        send([
            'customers'  => $rows,
            'last_query' => $_SESSION['last_customer_query'] ?? '',
            'count'      => count($rows),
        ]);
    }

    /* ---------------------------------------------------------------- */
    case 'get': {
        $id = (int) ($_GET['id'] ?? 0);
        $stmt = db()->prepare('SELECT * FROM customers WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            fail('Customer not found.', 404);
        }
        send(['customer' => $row]);
    }

    /* ---------------------------------------------------------------- */
    case 'create': {
        $d = body();
        $name = trim($d['name'] ?? '');
        if ($name === '') {
            fail('A customer name is required.');
        }

        $stmt = db()->prepare(
            'INSERT INTO customers (name, email, phone, address)
             VALUES (:name, :email, :phone, :address)'
        );
        $stmt->execute([
            ':name'    => $name,
            ':email'   => trim($d['email'] ?? ''),
            ':phone'   => trim($d['phone'] ?? ''),
            ':address' => trim($d['address'] ?? ''),
        ]);

        flash('success', $name . ' added to your customers.');
        send(['id' => (int) db()->lastInsertId()], 201);
    }

    /* ---------------------------------------------------------------- */
    case 'update': {
        $d  = body();
        $id = (int) ($d['id'] ?? 0);
        if ($id <= 0) {
            fail('Missing customer id.');
        }

        $stmt = db()->prepare(
            'UPDATE customers SET name = :name, email = :email, phone = :phone, address = :address
             WHERE id = :id'
        );
        $stmt->execute([
            ':name'    => trim($d['name'] ?? ''),
            ':email'   => trim($d['email'] ?? ''),
            ':phone'   => trim($d['phone'] ?? ''),
            ':address' => trim($d['address'] ?? ''),
            ':id'      => $id,
        ]);

        flash('success', 'Customer details updated.');
        send(['id' => $id]);
    }

    /* ---------------------------------------------------------------- */
    case 'delete': {
        $d  = body();
        $id = (int) ($d['id'] ?? 0);

        $check = db()->prepare('SELECT COUNT(*) FROM orders WHERE customer_id = :id');
        $check->execute([':id' => $id]);
        if ((int) $check->fetchColumn() > 0) {
            fail('This customer has orders on record, so they can’t be deleted.');
        }

        $stmt = db()->prepare('DELETE FROM customers WHERE id = :id');
        $stmt->execute([':id' => $id]);

        flash('info', 'Customer removed.');
        send(['id' => $id]);
    }

    /* ---------------------------------------------------------------- */
    default:
        fail('Unknown customer action.', 404);
}
