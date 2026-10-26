-- Data checks run after every load. Each query should return 0.
SET search_path = chalan;

SELECT 'shipments without a lane'          AS check, count(*) FROM fact_shipment f LEFT JOIN dim_lane l USING (lane_id) WHERE l.lane_id IS NULL
UNION ALL SELECT 'promised before dispatch', count(*) FROM fact_shipment WHERE promised_at <= dispatched_at
UNION ALL SELECT 'delivered before dispatch', count(*) FROM fact_shipment WHERE delivered_at < dispatched_at
UNION ALL SELECT 'on-time flag disagrees with times', count(*) FROM fact_shipment WHERE on_time = 1 AND delivered_at > promised_at
UNION ALL SELECT 'late without a reason', count(*) FROM fact_shipment WHERE on_time = 0 AND delay_reason IS NULL
UNION ALL SELECT 'in transit but delivered', count(*) FROM fact_shipment WHERE status = 'In transit' AND delivered_at IS NOT NULL
UNION ALL SELECT 'cost parts do not add up', count(*) FROM fact_shipment WHERE abs(freight_bdt + fuel_surcharge_bdt + handling_bdt - total_cost_bdt) > 1;
