#!/bin/bash
echo "=== shipping_records ==="
mysql -u root -pChen_1129 label_printer -e "SELECT sr.id, sr.status, sr.delivery_method, sr.gig_tracking, sr.delivery_staff_name, sr.shipped_at, sr.status_since, sr.updated_at, sr.updated_by, sr.initiated_at FROM shipping_records sr JOIN orders o ON o.id=sr.order_id WHERE sr.gig_tracking='NG021143763820' OR o.order_no LIKE '%NG021143763820%'"

echo "=== all shipping_records for this order ==="
mysql -u root -pChen_1129 label_printer -e "SELECT id, status, delivery_method, gig_tracking, delivery_staff_name, updated_by, updated_at FROM shipping_records WHERE order_id=(SELECT id FROM orders WHERE order_no LIKE 'PF0625%' AND id IN (SELECT order_id FROM shipping_records WHERE gig_tracking='NG021143763820'))"

echo "=== shipping_logs ==="
mysql -u root -pChen_1129 label_printer -e "SELECT sl.* FROM shipping_logs sl JOIN shipping_records sr ON sr.id=sl.shipping_id WHERE sr.gig_tracking='NG021143763820' ORDER BY sl.created_at"

echo "=== speedaf_shipments ==="
mysql -u root -pChen_1129 label_printer -e "SELECT * FROM speedaf_shipments WHERE waybill='NG021143763820'"

echo "=== speedaf_tracking_events ==="
mysql -u root -pChen_1129 label_printer -e "SELECT * FROM speedaf_tracking_events WHERE waybill='NG021143763820' ORDER BY event_time"
