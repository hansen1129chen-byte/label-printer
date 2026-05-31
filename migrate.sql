-- V2.1.0 Migration: GIGL Integration
-- Run after backup: mysqldump -u root -pChen_1129 label_printer > /opt/backup_$(date +%Y%m%d).sql

USE label_printer;

-- 1. Add order_time to orders
ALTER TABLE orders ADD COLUMN order_time DATETIME NULL AFTER updated_at;
UPDATE orders SET order_time = created_at WHERE order_time IS NULL;

-- 2. Fix shipping_records delivery_method (ENUM -> VARCHAR to avoid default GIG)
ALTER TABLE shipping_records MODIFY delivery_method VARCHAR(10) NULL;

-- 3. Create gigl_shipments table
CREATE TABLE IF NOT EXISTS gigl_shipments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    waybill VARCHAR(50) NOT NULL UNIQUE,
    gigl_shipment_id VARCHAR(50) DEFAULT '',
    receiver_name VARCHAR(200) DEFAULT '',
    receiver_phone VARCHAR(30) DEFAULT '',
    grand_total DECIMAL(10,2) DEFAULT 0,
    payment_status TINYINT DEFAULT 0,
    shipment_scan_status INT DEFAULT 0,
    current_scan_status VARCHAR(100) DEFAULT '',
    is_delivered TINYINT DEFAULT 0,
    is_cancelled TINYINT DEFAULT 0,
    date_created DATETIME NULL,
    date_modified DATETIME NULL,
    tracking_raw TEXT,
    matched_shipping_id BIGINT NULL,
    shipment_source VARCHAR(20) DEFAULT '',
    is_express_dropoff TINYINT DEFAULT 0,
    is_from_mobile TINYINT DEFAULT 0,
    is_international TINYINT DEFAULT 0,
    delivery_option_id INT DEFAULT 0,
    destination VARCHAR(500) DEFAULT '',
    sender_phone VARCHAR(30) DEFAULT '',
    last_synced_at DATETIME NULL,
    INDEX idx_matched (matched_shipping_id),
    INDEX idx_delivered (is_delivered),
    INDEX idx_waybill (waybill)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Create gigl_tracking_events table
CREATE TABLE IF NOT EXISTS gigl_tracking_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    waybill VARCHAR(50) NOT NULL,
    event_time DATETIME NULL,
    location VARCHAR(200) DEFAULT '',
    status_code VARCHAR(10) DEFAULT '',
    status_description VARCHAR(200) DEFAULT '',
    status_reason VARCHAR(300) DEFAULT '',
    status_comment VARCHAR(300) DEFAULT '',
    operator_name VARCHAR(100) DEFAULT '',
    UNIQUE KEY uniq_waybill_event (waybill, event_time, status_code),
    INDEX idx_waybill (waybill),
    INDEX idx_event_time (event_time),
    INDEX idx_status (status_code),
    FOREIGN KEY (waybill) REFERENCES gigl_shipments(waybill) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
