-- =============================================================
--  ChocoDel Order & Inventory System
--  Database schema + seed data
--  Run this once in phpMyAdmin (XAMPP) or the MySQL CLI.
-- =============================================================

DROP DATABASE IF EXISTS chocodel;
CREATE DATABASE chocodel CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE chocodel;

-- -------------------------------------------------------------
--  Products  (the actual ChocoDel range)
-- -------------------------------------------------------------
CREATE TABLE products (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    sku           VARCHAR(32)  NOT NULL UNIQUE,
    name          VARCHAR(120) NOT NULL,
    category      VARCHAR(60)  NOT NULL,
    price         DECIMAL(10,2) NOT NULL,
    stock_qty     INT NOT NULL DEFAULT 0,
    reorder_level INT NOT NULL DEFAULT 10,
    description   TEXT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- -------------------------------------------------------------
--  Customers
-- -------------------------------------------------------------
CREATE TABLE customers (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(120) NOT NULL,
    email      VARCHAR(120),
    phone      VARCHAR(40),
    address    TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- -------------------------------------------------------------
--  Orders  (header)
-- -------------------------------------------------------------
CREATE TABLE orders (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    order_date  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    subtotal    DECIMAL(10,2) NOT NULL DEFAULT 0,
    discount    DECIMAL(10,2) NOT NULL DEFAULT 0,
    tax         DECIMAL(10,2) NOT NULL DEFAULT 0,
    total       DECIMAL(10,2) NOT NULL DEFAULT 0,
    status      ENUM('paid','unpaid') NOT NULL DEFAULT 'unpaid',
    note        VARCHAR(255),
    CONSTRAINT fk_orders_customer
        FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB;

-- -------------------------------------------------------------
--  Order items  (lines)  -- price/name snapshotted at sale time
-- -------------------------------------------------------------
CREATE TABLE order_items (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    order_id    INT NOT NULL,
    product_id  INT NOT NULL,
    product_name VARCHAR(120) NOT NULL,
    unit_price  DECIMAL(10,2) NOT NULL,
    quantity    INT NOT NULL,
    line_total  DECIMAL(10,2) NOT NULL,
    CONSTRAINT fk_items_order
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_items_product
        FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

-- =============================================================
--  SEED DATA
-- =============================================================

INSERT INTO products (sku, name, category, price, stock_qty, reorder_level, description) VALUES
('CD-CLS-220', 'Classic Milk Chocolate Spread 220g', 'Spread',     18.90,  64, 20, 'The original ChocoDel. Smooth milk chocolate, no palm oil.'),
('CD-DRK-220', 'Dark 70% Chocolate Spread 220g',     'Spread',     21.50,  41, 20, 'For the grown-ups. Intense 70% cacao, lightly sweetened.'),
('CD-HZL-220', 'Hazelnut Praline Spread 220g',       'Spread',     23.90,  12, 20, 'Roasted hazelnut praline folded into milk chocolate.'),
('CD-WHT-220', 'White Chocolate & Vanilla 220g',     'Spread',     19.90,   6, 15, 'Madagascar vanilla in a creamy white chocolate base.'),
('CD-CLS-450', 'Classic Milk Chocolate Spread 450g', 'Spread',     32.00,  28, 15, 'Family-size jar of the classic. Best seller.'),
('CD-SLT-220', 'Salted Caramel Chocolate 220g',      'Spread',     22.50,   0, 18, 'Milk chocolate swirled with salted caramel. Currently sold out.'),
('CD-GFT-TRIO','Trio Gift Box (3 x 220g)',           'Gift Box',   62.00,  17, 10, 'Classic, Dark and Hazelnut in a kraft gift box.'),
('CD-GFT-LUX', 'Luxury Gift Hamper',                 'Gift Box',  118.00,   4,  6, 'Two large jars, spreader knife and ceramic dish.'),
('CD-MIN-50',  'Mini Jar 50g (Classic)',            'Mini',        6.50, 140, 40, 'Pocket-size jar. Popular for events and party favours.'),
('CD-MIN-PK6', 'Mini Jar Party Pack (6 x 50g)',     'Mini',       34.00,   9, 12, 'Six assorted mini jars. Great for gifting.'),
('CD-ACC-KNF', 'ChocoDel Wooden Spreader',          'Accessory',   9.90,  73, 25, 'Beechwood spreader, laser-etched logo.');

INSERT INTO customers (name, email, phone, address) VALUES
('Aisyah Rahman',      'aisyah.r@gmail.com',     '012-3345567', '14 Jalan Mawar, Taman Sri Indah, 06000 Jitra, Kedah'),
('Daniel Tan',         'daniel.tan@outlook.com', '016-7782210', '88 Lorong Cempaka 3, 11900 Bayan Lepas, Penang'),
('Nurul Izzah Cafe',   'orders@nurulcafe.my',    '04-7745120',  'Lot 22, Pekan Changlun, 06010 Changlun, Kedah'),
('Hafiz Zulkarnain',   'hafiz.z@yahoo.com',      '019-4456781', '7 Jalan UUM, Sintok, 06010 Sintok, Kedah'),
('Mei Ling Wong',      'meiling.w@gmail.com',    '011-22987654','120 Persiaran Bukit, 50480 Kuala Lumpur'),
('Sweet Corner Bakery','hello@sweetcorner.my',   '03-78812245', '5 Jalan SS15/4, 47500 Subang Jaya, Selangor'),
('Faridah Ismail',     'faridah.ismail@gmail.com','013-5567899','33 Kampung Baru, 05300 Alor Setar, Kedah');

-- Orders + items (a few weeks of trading so the dashboard has a story)
INSERT INTO orders (customer_id, order_date, subtotal, discount, tax, total, status, note) VALUES
(3, '2026-05-28 10:15:00', 620.00, 31.00, 35.34, 624.34, 'paid',   'Wholesale order for cafe'),
(1, '2026-06-02 14:40:00',  61.30,  0.00,  3.68,  64.98, 'paid',   NULL),
(6, '2026-06-05 09:20:00', 540.00, 27.00, 30.78, 543.78, 'unpaid', 'Awaiting bank transfer'),
(2, '2026-06-09 16:05:00',  85.40,  0.00,  5.12,  90.52, 'paid',   NULL),
(4, '2026-06-12 11:30:00',  41.40,  0.00,  2.48,  43.88, 'paid',   NULL),
(5, '2026-06-15 13:10:00', 118.00,  0.00,  7.08, 125.08, 'unpaid', 'Gift hamper for office'),
(7, '2026-06-18 15:45:00',  72.40,  0.00,  4.34,  76.74, 'paid',   NULL),
(1, '2026-06-21 10:00:00',  39.80,  0.00,  2.39,  42.19, 'paid',   NULL);

INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, line_total) VALUES
-- Order 1 (cafe wholesale)
(1, 5, 'Classic Milk Chocolate Spread 450g', 32.00, 10, 320.00),
(1, 1, 'Classic Milk Chocolate Spread 220g', 18.90, 10, 189.00),
(1, 9, 'Mini Jar 50g (Classic)',              6.50, 10,  65.00),
(1, 11,'ChocoDel Wooden Spreader',            9.90,  5,  49.50),
-- Order 2
(2, 3, 'Hazelnut Praline Spread 220g',       23.90,  1,  23.90),
(2, 7, 'Trio Gift Box (3 x 220g)',           62.00,  0,  62.00),
-- Order 3 (wholesale, unpaid)
(3, 5, 'Classic Milk Chocolate Spread 450g', 32.00,  8, 256.00),
(3, 2, 'Dark 70% Chocolate Spread 220g',     21.50,  8, 172.00),
(3, 9, 'Mini Jar 50g (Classic)',              6.50, 18, 117.00),
-- Order 4
(4, 7, 'Trio Gift Box (3 x 220g)',           62.00,  1,  62.00),
(4, 3, 'Hazelnut Praline Spread 220g',       23.90,  1,  23.90),
-- Order 5
(5, 1, 'Classic Milk Chocolate Spread 220g', 18.90,  1,  18.90),
(5, 9, 'Mini Jar 50g (Classic)',              6.50,  2,  13.00),
(5, 11,'ChocoDel Wooden Spreader',            9.90,  1,   9.90),
-- Order 6 (luxury hamper, unpaid)
(6, 8, 'Luxury Gift Hamper',                118.00,  1, 118.00),
-- Order 7
(7, 10,'Mini Jar Party Pack (6 x 50g)',      34.00,  2,  68.00),
(7, 11,'ChocoDel Wooden Spreader',            9.90,  0,   4.40),
-- Order 8
(8, 1, 'Classic Milk Chocolate Spread 220g', 18.90,  1,  18.90),
(8, 4, 'White Chocolate & Vanilla 220g',     19.90,  1,  19.90);

-- Fix a couple of line quantities that were placeholders above
UPDATE order_items SET quantity = 1 WHERE order_id = 2 AND product_id = 7;
UPDATE order_items SET quantity = 1, line_total = 9.90 WHERE order_id = 7 AND product_id = 11;
UPDATE orders SET subtotal = 72.40, tax = 4.34, total = 76.74 WHERE id = 7;
