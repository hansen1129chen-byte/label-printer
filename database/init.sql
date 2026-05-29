-- Label Printer - Database Schema

CREATE DATABASE IF NOT EXISTS label_printer DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE label_printer;

-- Accounts
CREATE TABLE accounts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin','operator') NOT NULL DEFAULT 'operator',
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Streamers (configurable)
CREATE TABLE streamers (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    commission_rate DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT 'percentage e.g. 10.00 = 10%',
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Payment statuses (configurable)
CREATE TABLE payment_statuses (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(20) DEFAULT '#1989fa',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Delivery staff (configurable)
CREATE TABLE delivery_staff (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Products
CREATE TABLE products (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    sort_order INT DEFAULT 0,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    status ENUM('active','inactive') DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Orders (all reference data is snapshotted)
CREATE TABLE orders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_no VARCHAR(20) NOT NULL UNIQUE,
    customer_name VARCHAR(200) DEFAULT '',
    customer_gender ENUM('male','female','') DEFAULT '',
    customer_phone VARCHAR(30) DEFAULT '',
    customer_address VARCHAR(500) DEFAULT '',
    streamer_id BIGINT DEFAULT NULL,
    streamer_name VARCHAR(100) DEFAULT '',
    payment_status_id BIGINT DEFAULT NULL,
    payment_status_name VARCHAR(50) DEFAULT '',
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    actual_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    remark VARCHAR(500) DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (streamer_id) REFERENCES streamers(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_status_id) REFERENCES payment_statuses(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Order items
CREATE TABLE order_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT NOT NULL,
    product_id BIGINT NULL,
    product_code VARCHAR(50) NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    subtotal DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Shipping records (delivery staff name is snapshotted)
CREATE TABLE shipping_records (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT NOT NULL,
    shipping_code VARCHAR(30) NOT NULL UNIQUE COMMENT 'unique tracking code',
    delivery_method ENUM('gig','own') NOT NULL,
    gig_tracking VARCHAR(100) DEFAULT '',
    delivery_staff_id BIGINT NULL,
    delivery_staff_name VARCHAR(100) DEFAULT '',
    status ENUM('pending','in_transit','delivered','returned') DEFAULT 'pending',
    initiated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (delivery_staff_id) REFERENCES delivery_staff(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Default seed data
INSERT INTO streamers (name, commission_rate) VALUES ('NIFEMI', 10.00), ('JESSICA', 10.00), ('VINCENT', 10.00);
INSERT INTO payment_statuses (name, color) VALUES ('PAID', '#22c55e'), ('NOT PAID', '#ef4444');
INSERT INTO delivery_staff (name) VALUES ('John'), ('Mike');
INSERT INTO products (sort_order, code, name, price) VALUES
(1, 'MAB007', 'Eclaire', 30000),
(2, 'MAB002-1', '9PM REBEL', 30000),
(3, 'MAB005', 'Fursan', 18000),
(4, 'MAB021-6', 'ASAD BOURBON', 15000),
(5, 'MAB001-1', 'Badee Al Oud Sublime', 25000),
(6, 'MAB041-1', 'His Confession', 35000),
(7, 'MAB047', 'KHAMRAH', 28000),
(8, 'MAB002', '9PM', 30000),
(9, 'MAB021-1', 'ASAD', 15000),
(10, 'MAB021', 'Yara', 15000),
(11, 'MAB001-2', 'Badee Al Oud Honor And Glory', 25000);
