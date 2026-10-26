-- Chalan warehouse: one fact table of shipments, small dimensions around it (star schema).
-- Times are stored in UTC; reporting converts to Asia/Dhaka.

DROP SCHEMA IF EXISTS chalan CASCADE;
CREATE SCHEMA chalan;
SET search_path = chalan;

CREATE TABLE dim_hub (
    hub_id           text PRIMARY KEY,
    hub_name         text NOT NULL,
    short_name       text NOT NULL,
    latitude         numeric(8,4),
    longitude        numeric(8,4),
    is_international boolean NOT NULL
);

CREATE TABLE dim_carrier (
    carrier_id   text PRIMARY KEY,
    carrier_name text NOT NULL UNIQUE,
    mode         text NOT NULL CHECK (mode IN ('road', 'sea', 'air'))
);

CREATE TABLE dim_customer (
    customer_id text PRIMARY KEY,
    segment     text NOT NULL
);

CREATE TABLE dim_lane (
    lane_id        text PRIMARY KEY,           -- e.g. GZP-CGP
    origin_id      text NOT NULL REFERENCES dim_hub,
    destination_id text NOT NULL REFERENCES dim_hub,
    mode           text NOT NULL,
    via_chattogram boolean NOT NULL
);

CREATE TABLE ref_holiday (
    holiday_date date PRIMARY KEY,
    name         text NOT NULL
);

CREATE TABLE ref_port_congestion (
    day   date PRIMARY KEY,
    index numeric(4,3) NOT NULL CHECK (index BETWEEN 0 AND 1)
);

CREATE TABLE dim_date (
    date_key    date PRIMARY KEY,
    year        int  NOT NULL,
    month       int  NOT NULL,
    month_start date NOT NULL,
    iso_week    int  NOT NULL,
    weekday     text NOT NULL,
    is_friday   boolean NOT NULL,              -- the main weekly holiday in Bangladesh
    is_monsoon  boolean NOT NULL,              -- June to September
    eid_window  boolean NOT NULL               -- 10 days before to 4 days after an Eid
);

CREATE TABLE fact_shipment (
    shipment_id           text PRIMARY KEY,
    lane_id               text NOT NULL REFERENCES dim_lane,
    carrier_id            text NOT NULL REFERENCES dim_carrier,
    customer_id           text NOT NULL REFERENCES dim_customer,
    dispatch_date         date NOT NULL REFERENCES dim_date,
    delivered_date        date REFERENCES dim_date,
    vehicle               text NOT NULL,
    weight_kg             numeric(10,1) NOT NULL CHECK (weight_kg > 0),
    distance_km           numeric(8,1)  NOT NULL,
    cargo_value_bdt       numeric(14,0) NOT NULL,
    dispatched_at         timestamptz NOT NULL,
    promised_at           timestamptz NOT NULL CHECK (promised_at > dispatched_at),
    delivered_at          timestamptz,
    status                text NOT NULL CHECK (status IN ('Delivered', 'In transit')),
    delivery_time_missing boolean NOT NULL DEFAULT false,
    on_time               smallint CHECK (on_time IN (0, 1)),
    delay_hours           numeric(7,1),
    delay_reason          text,
    freight_bdt           numeric(12,0) NOT NULL CHECK (freight_bdt > 0),
    fuel_surcharge_bdt    numeric(12,0) NOT NULL,
    handling_bdt          numeric(12,0) NOT NULL,
    total_cost_bdt        numeric(12,0) NOT NULL
);
CREATE INDEX ON fact_shipment (dispatch_date);
CREATE INDEX ON fact_shipment (delivered_date);
CREATE INDEX ON fact_shipment (lane_id, carrier_id);

-- written by the model step (analytics/pipeline/train_model.py)
CREATE TABLE shipment_risk (
    shipment_id   text PRIMARY KEY REFERENCES fact_shipment,
    risk_score    numeric(5,4) NOT NULL,
    risk_band     text NOT NULL,
    model_version text NOT NULL,
    scored_at     timestamptz NOT NULL DEFAULT now()
);
