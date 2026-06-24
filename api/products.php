<?php
/**
 * ChocoDel — Products API.
 *
 * Actions (?action=...):
 *   list    GET   list + wildcard LIKE search (remembers last query in session)
 *   get     GET   single product by id
 *   create  POST  add a product
 *   update  POST  edit a product
 *   delete  POST  remove a product (blocked if it has been sold)
 *
 * Every statement is a PDO prepared statement. Stock flags
 * (out / low / ok) are computed server-side so the UI stays dumb.
 */

require_once __DIR__ . '/helpers.php';

/** Tag a product row with its stock status — the conditional business logic. */
function with_stock_flag(array $p): array
{
    $qty    = (int) $p['stock_qty'];
    $level  = (int) $p['reorder_level'];

    if ($qty <= 0) {
        $p['stock_status'] = 'out';
        $p['stock_label']  = 'Out of stock';
    } elseif ($qty <= $level) {
        $p['stock_status'] = 'low';
        $p['stock_label']  = 'Low stock';
    } else {
        $p['stock_status'] = 'ok';
        $p['stock_label']  = 'In stock';
    }

    $p['price']     = (float) $p['price'];
    $p['stock_qty'] = $qty;
    $p['reorder_level'] = $level;
    return $p;
}

switch (action()) {

    /* ---------------------------------------------------------------- */
    case 'list': {
        $q = trim($_GET['q'] ?? '');

        // Remember the last search the user ran (session requirement).
        if (isset($_GET['q'])) {
            $_SESSION['last_product_query'] = $q;
        }

        if ($q !== '') {
            // Wildcard LIKE across name, SKU and category. (Native prepared
            // statements need a distinct placeholder per use, hence :t1..:t3.)
            $term = '%' . $q . '%';
            $stmt = db()->prepare(
                'SELECT * FROM products
                 WHERE name LIKE :t1 OR sku LIKE :t2 OR category LIKE :t3
                 ORDER BY name'
            );
            $stmt->execute([':t1' => $term, ':t2' => $term, ':t3' => $term]);
        } else {
            $stmt = db()->query('SELECT * FROM products ORDER BY name');
        }

        $rows = array_map('with_stock_flag', $stmt->fetchAll());

        send([
            'products'   => $rows,
            'last_query' => $_SESSION['last_product_query'] ?? '',
            'count'      => count($rows),
        ]);
    }

    /* ---------------------------------------------------------------- */
    case 'get': {
        $id = (int) ($_GET['id'] ?? 0);
        $stmt = db()->prepare('SELECT * FROM products WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            fail('Product not found.', 404);
        }
        send(['product' => with_stock_flag($row)]);
    }

    /* ---------------------------------------------------------------- */
    case 'create': {
        $d = body();
        $sku  = trim($d['sku'] ?? '');
        $name = trim($d['name'] ?? '');
        if ($sku === '' || $name === '') {
            fail('SKU and name are required.');
        }

        try {
            $stmt = db()->prepare(
                'INSERT INTO products (sku, name, category, price, stock_qty, reorder_level, description)
                 VALUES (:sku, :name, :category, :price, :stock_qty, :reorder_level, :description)'
            );
            $stmt->execute([
                ':sku'           => $sku,
                ':name'          => $name,
                ':category'      => trim($d['category'] ?? 'Spread'),
                ':price'         => (float) ($d['price'] ?? 0),
                ':stock_qty'     => (int) ($d['stock_qty'] ?? 0),
                ':reorder_level' => (int) ($d['reorder_level'] ?? 10),
                ':description'   => trim($d['description'] ?? ''),
            ]);
        } catch (PDOException $e) {
            // 23000 = integrity constraint (duplicate SKU here).
            if ($e->getCode() === '23000') {
                fail('That SKU already exists. Pick a different one.');
            }
            throw $e;
        }

        flash('success', '“' . $name . '” added to the catalogue.');
        send(['id' => (int) db()->lastInsertId()], 201);
    }

    /* ---------------------------------------------------------------- */
    case 'update': {
        $d  = body();
        $id = (int) ($d['id'] ?? 0);
        if ($id <= 0) {
            fail('Missing product id.');
        }

        $stmt = db()->prepare(
            'UPDATE products SET
                sku = :sku, name = :name, category = :category, price = :price,
                stock_qty = :stock_qty, reorder_level = :reorder_level, description = :description
             WHERE id = :id'
        );
        $stmt->execute([
            ':sku'           => trim($d['sku'] ?? ''),
            ':name'          => trim($d['name'] ?? ''),
            ':category'      => trim($d['category'] ?? 'Spread'),
            ':price'         => (float) ($d['price'] ?? 0),
            ':stock_qty'     => (int) ($d['stock_qty'] ?? 0),
            ':reorder_level' => (int) ($d['reorder_level'] ?? 10),
            ':description'   => trim($d['description'] ?? ''),
            ':id'            => $id,
        ]);

        flash('success', 'Product details updated.');
        send(['id' => $id]);
    }

    /* ---------------------------------------------------------------- */
    case 'delete': {
        $d  = body();
        $id = (int) ($d['id'] ?? 0);

        // Don't orphan order history — block deletes for products that sold.
        $check = db()->prepare('SELECT COUNT(*) FROM order_items WHERE product_id = :id');
        $check->execute([':id' => $id]);
        if ((int) $check->fetchColumn() > 0) {
            fail('This product appears in past orders, so it can’t be deleted. Set its stock to 0 instead.');
        }

        $stmt = db()->prepare('DELETE FROM products WHERE id = :id');
        $stmt->execute([':id' => $id]);

        flash('info', 'Product removed from the catalogue.');
        send(['id' => $id]);
    }

    /* ---------------------------------------------------------------- */
    default:
        fail('Unknown product action.', 404);
}
