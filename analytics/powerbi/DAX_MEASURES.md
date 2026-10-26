# DAX measures

Put these in a table called `_Measures`. Performance measures follow the **delivery date**
(active relationship `fact_shipment[delivered_date] → dim_date[date_key]`), the same rule the
SQL views and the web app use.

## Core

```dax
Delivered =
CALCULATE ( COUNTROWS ( fact_shipment ), NOT ISBLANK ( fact_shipment[on_time] ) )

On Time =
CALCULATE ( COUNTROWS ( fact_shipment ), fact_shipment[on_time] = 1 )

OTD % =
DIVIDE ( [On Time], [Delivered] )

SLA Breaches =
CALCULATE ( COUNTROWS ( fact_shipment ), fact_shipment[on_time] = 0 )

SLA Breach % =
DIVIDE ( [SLA Breaches], [Delivered] )

Avg Delay When Late (h) =
CALCULATE ( AVERAGE ( fact_shipment[delay_hours] ), fact_shipment[on_time] = 0 )

Total Cost (BDT) =
CALCULATE ( SUM ( fact_shipment[total_cost_bdt] ), NOT ISBLANK ( fact_shipment[on_time] ) )

Cost per Shipment (BDT) =
DIVIDE ( [Total Cost (BDT)], [Delivered] )

Cost per Kg (BDT) =
DIVIDE (
    [Total Cost (BDT)],
    CALCULATE ( SUM ( fact_shipment[weight_kg] ), NOT ISBLANK ( fact_shipment[on_time] ) )
)
```

## Target and trend

```dax
OTD Target = 0.90

Gap to Target (pts) =
( [OTD %] - [OTD Target] ) * 100

OTD % Previous Month =
CALCULATE ( [OTD %], DATEADD ( dim_date[date_key], -1, MONTH ) )

OTD % Change (pts) =
( [OTD %] - [OTD % Previous Month] ) * 100

OTD % Rolling 30 Days =
CALCULATE (
    [OTD %],
    DATESINPERIOD ( dim_date[date_key], MAX ( dim_date[date_key] ), -30, DAY )
)

OTD Status Colour =
SWITCH ( TRUE (), [OTD %] >= 0.90, "#2E7A55", [OTD %] >= 0.80, "#C98F06", "#BE3B2B" )
```

Use `OTD Status Colour` in conditional formatting (Format → Field value) for cards, bars and the map.

## Shipments on the move (ignore the date slicer)

```dax
As Of =
CALCULATE (
    MAX ( fact_shipment[dispatched_at] ),
    REMOVEFILTERS ()
)

Open Shipments =
CALCULATE (
    COUNTROWS ( fact_shipment ),
    fact_shipment[status] = "In transit",
    REMOVEFILTERS ( dim_date )
)

Overdue Shipments =
VAR asOf = [As Of]
RETURN
    CALCULATE (
        [Open Shipments],
        FILTER ( fact_shipment, fact_shipment[promised_at] < asOf )
    )

High-Risk Open Shipments =
CALCULATE ( [Open Shipments], shipment_risk[risk_band] = "High" )

Cargo Value at Risk (BDT) =
CALCULATE (
    SUM ( fact_shipment[cargo_value_bdt] ),
    fact_shipment[status] = "In transit",
    shipment_risk[risk_band] = "High",
    REMOVEFILTERS ( dim_date )
)
```

## Ranking and share

```dax
Lane Rank (worst first) =
RANKX ( ALLSELECTED ( dim_lane[lane_id] ), [OTD %], , ASC, DENSE )

Carrier Share of Mode =
DIVIDE ( [Delivered], CALCULATE ( [Delivered], ALLEXCEPT ( dim_carrier, dim_carrier[mode] ) ) )

Share of Breaches =
DIVIDE ( [SLA Breaches], CALCULATE ( [SLA Breaches], ALLSELECTED () ) )
```

## Scenario: move volume to the more reliable carrier (what-if parameter)

Create a what-if parameter **Volume Shift** from 0 to 1 in steps of 0.05 (Modeling → New parameter).
For each road lane, the measure moves that share of the least reliable carrier's volume to the most
reliable carrier on the same lane (carriers with at least 20 deliveries in the period).

```dax
Breaches Avoided (Carrier Shift) =
VAR shift = [Volume Shift Value]
RETURN
    SUMX (
        FILTER ( VALUES ( dim_lane[lane_id] ), CALCULATE ( SELECTEDVALUE ( dim_lane[mode] ) ) = "road" ),
        VAR carriers =
            FILTER (
                CALCULATETABLE (
                    ADDCOLUMNS ( VALUES ( fact_shipment[carrier_id] ), "@otd", [OTD %], "@n", [Delivered] )
                ),
                [@n] >= 20
            )
        VAR best = MAXX ( carriers, [@otd] )
        VAR worst = TOPN ( 1, carriers, [@otd], ASC )
        RETURN
            IF ( COUNTROWS ( carriers ) >= 2, shift * MAXX ( worst, [@n] ) * ( best - MAXX ( worst, [@otd] ) ) )
    )

Projected OTD % =
DIVIDE ( [On Time] + [Breaches Avoided (Carrier Shift)], [Delivered] )
```

Check: with the period set to the last 90 days and **Volume Shift** at 0.30, the result should
match the carrier lever on the web app's Scenario page.
