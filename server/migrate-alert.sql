CREATE TABLE IF NOT EXISTS alert_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  config_key VARCHAR(50) NOT NULL UNIQUE,
  config_value VARCHAR(100) NOT NULL DEFAULT '',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
INSERT IGNORE INTO alert_config (config_key, config_value) VALUES ('pending_alert_hours', '24'), ('in_transit_own_alert_hours', '48'), ('in_transit_gigl_alert_hours', '120');

-- Add status_since column for accurate duration tracking (tracks when current status began)
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'label_printer' AND TABLE_NAME = 'shipping_records' AND COLUMN_NAME = 'status_since');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE shipping_records ADD COLUMN status_since DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE shipping_records SET status_since = COALESCE(shipped_at, initiated_at) WHERE status_since IS NULL;
