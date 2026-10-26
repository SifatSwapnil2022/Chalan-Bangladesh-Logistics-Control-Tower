-- Reporting views. Power BI and the web app read these, never the raw fact table.
SET search_path = chalan;

-- The "as of" moment of the data: the latest event recorded.
CREATE OR REPLACE VIEW v_as_of AS
SELECT greatest(max(dispatched_at), max(delivered_at)) AS as_of FROM fact_shipment;

-- Delivered shipments that can be scored on time (delivery time recorded).
CREATE OR REPLACE VIEW v_scored AS
SELECT f.*, l.origin_id, l.destination_id, l.mode, l.via_chattogram
FROM fact_shipment f
JOIN dim_lane l USING (lane_id)
WHERE f.on_time IS NOT NULL;

-- Monthly KPIs, by month of delivery.
CREATE OR REPLACE VIEW v_kpi_monthly AS
SELECT d.month_start,
       count(*)                                                   AS delivered,
       round(100.0 * avg(s.on_time), 1)                           AS otd_pct,
       count(*) FILTER (WHERE s.on_time = 0)                      AS sla_breaches,
       round(avg(s.delay_hours) FILTER (WHERE s.on_time = 0), 1)  AS avg_delay_when_late_h,
       round(avg(s.total_cost_bdt))                               AS cost_per_shipment_bdt,
       round(sum(s.total_cost_bdt) / sum(s.weight_kg), 2)         AS cost_per_kg_bdt
FROM v_scored s
JOIN dim_date d ON d.date_key = s.delivered_date
GROUP BY d.month_start
ORDER BY d.month_start;

-- Lane performance over the last 90 days.
CREATE OR REPLACE VIEW v_lane_performance_90d AS
SELECT s.lane_id, s.origin_id, s.destination_id, s.mode,
       count(*)                                                                    AS delivered,
       round(100.0 * avg(s.on_time), 1)                                            AS otd_pct,
       count(*) FILTER (WHERE s.on_time = 0)                                       AS sla_breaches,
       round((percentile_cont(0.9) WITHIN GROUP (ORDER BY s.delay_hours))::numeric, 1) AS p90_delay_h,
       round(avg(s.total_cost_bdt))                                                AS cost_per_shipment_bdt
FROM v_scored s, v_as_of a
WHERE s.delivered_at > a.as_of - interval '90 days'
GROUP BY s.lane_id, s.origin_id, s.destination_id, s.mode
ORDER BY otd_pct;

-- Carrier scorecard over the last 90 days, ranked within each mode.
CREATE OR REPLACE VIEW v_carrier_scorecard_90d AS
WITH base AS (
    SELECT s.carrier_id, c.carrier_name, c.mode,
           count(*)                                                  AS delivered,
           round(100.0 * avg(s.on_time), 1)                          AS otd_pct,
           round(avg(s.delay_hours) FILTER (WHERE s.on_time = 0), 1) AS avg_delay_when_late_h,
           round(sum(s.total_cost_bdt) / sum(s.weight_kg), 2)        AS cost_per_kg_bdt
    FROM v_scored s
    JOIN dim_carrier c USING (carrier_id), v_as_of a
    WHERE s.delivered_at > a.as_of - interval '90 days'
    GROUP BY s.carrier_id, c.carrier_name, c.mode
)
SELECT base.*,
       round(100.0 * delivered / sum(delivered) OVER (PARTITION BY mode), 1) AS share_of_mode_pct,
       rank() OVER (PARTITION BY mode ORDER BY otd_pct DESC)               AS otd_rank_in_mode
FROM base
ORDER BY mode, otd_rank_in_mode;

-- Why shipments were late, last 90 days.
CREATE OR REPLACE VIEW v_delay_causes_90d AS
SELECT s.mode, s.delay_reason,
       count(*)                                                     AS late_shipments,
       round(sum(s.delay_hours))                                    AS delay_hours,
       round(100.0 * count(*) / sum(count(*)) OVER (PARTITION BY s.mode), 1) AS share_of_mode_pct
FROM v_scored s, v_as_of a
WHERE s.on_time = 0 AND s.delivered_at > a.as_of - interval '90 days'
GROUP BY s.mode, s.delay_reason
ORDER BY s.mode, late_shipments DESC;

-- Open shipments that need someone's attention, most urgent first.
CREATE OR REPLACE VIEW v_open_exceptions AS
SELECT f.shipment_id, f.lane_id, f.carrier_id, f.customer_id, f.dispatched_at, f.promised_at,
       round(extract(epoch FROM (a.as_of - f.promised_at)) / 3600, 1) AS hours_past_promise,
       r.risk_score, r.risk_band,
       CASE WHEN f.promised_at < a.as_of THEN 'Overdue'
            WHEN r.risk_band = 'High' THEN 'High risk'
            ELSE 'On track' END AS exception_type,
       f.cargo_value_bdt
FROM fact_shipment f
CROSS JOIN v_as_of a
LEFT JOIN shipment_risk r USING (shipment_id)
WHERE f.status = 'In transit'
ORDER BY (f.promised_at < a.as_of) DESC, r.risk_score DESC NULLS LAST;
