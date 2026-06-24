-- Speedaf Integration Migration
-- Run against production DB before deploying new code

-- 1. shipping_records.delivery_method: ENUM → VARCHAR (support 'speedaf')
ALTER TABLE shipping_records MODIFY delivery_method VARCHAR(10) NULL DEFAULT NULL;

-- 2. shipping_records.status: ENUM → VARCHAR (support new statuses)
ALTER TABLE shipping_records MODIFY status VARCHAR(20) DEFAULT 'pending';

-- 3. orders: add province/city/district + phone2 for Speedaf API
ALTER TABLE orders ADD COLUMN customer_phone2 VARCHAR(30) DEFAULT '' AFTER customer_phone;
ALTER TABLE orders ADD COLUMN accept_province VARCHAR(100) DEFAULT 'LAGOS';
ALTER TABLE orders ADD COLUMN accept_city VARCHAR(100) DEFAULT 'LAGOS';
ALTER TABLE orders ADD COLUMN accept_district VARCHAR(100) DEFAULT 'LAGOS';

-- 4. Speedaf shipments cache (like gigl_shipments)
CREATE TABLE IF NOT EXISTS speedaf_shipments (
    waybill VARCHAR(50) PRIMARY KEY,
    order_no VARCHAR(20) DEFAULT '',
    receiver_name VARCHAR(200) DEFAULT '',
    receiver_phone VARCHAR(30) DEFAULT '',
    destination VARCHAR(200) DEFAULT '',
    current_status VARCHAR(50) DEFAULT '',
    current_status_desc VARCHAR(200) DEFAULT '',
    matched_shipping_id BIGINT NULL,
    tracking_raw TEXT,
    last_synced_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_order_no (order_no),
    INDEX idx_matched_shipping (matched_shipping_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Speedaf tracking events (like gigl_tracking_events)
CREATE TABLE IF NOT EXISTS speedaf_tracking_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    waybill VARCHAR(50) NOT NULL,
    event_time DATETIME,
    location VARCHAR(200) DEFAULT '',
    status_code VARCHAR(20) DEFAULT '',
    status_description VARCHAR(200) DEFAULT '',
    operator_name VARCHAR(100) DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_waybill (waybill),
    UNIQUE KEY uk_waybill_time (waybill, event_time, status_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
