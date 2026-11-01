# DPCS Data Model — Draft 1

**Scope:** One factory  
**Source process:** Monthly Excel file named `Order Manajemen`  
**Status:** Initial design based on the sample workbook; validate before application implementation.

## 1. Confirmed business rules

1. `Control Number` identifies a die design/type, not an individual physical unit.
2. One Control Number may be ordered in multiple units. Example: Control Number `26X0034A`, Qty `3` means three physical dies of the same design.
3. `Qty` is the number of dies ordered, not the number of parts produced.
4. `Price` is treated as unit price and `Total` is Qty multiplied by Price, based on the supplied sample.
5. Each physical die unit must have its own factory-marked identity, written manually with a marker (for example, `26X0043 #1`, `26X0043 #2`). DPCS stores this exact identity so inspection, usage, repair, and maintenance history can be tracked separately.
6. Monthly Excel imports must be traceable to the original file and import batch.

## 2. Excel source columns

| Excel column | Proposed DPCS destination | Rule |
|---|---|---|
| No | Import row number | Source row reference; not a permanent business ID |
| Tanggal PO | Order line PO date | Required date |
| Due date Delivery | Order line due date | Must not be earlier than PO date |
| Control Number | Die model | Required; normalized for spaces/case but preserve original display |
| Customer | Customer master / order line | Required |
| Desrkipsi | Die model description | Source header spelling retained during import mapping |
| Material | Die model material | Example: SKD11, YXR7 |
| Qty | Order line quantity | Positive whole number; number of dies ordered |
| Price | Order line unit price | Non-negative numeric value |
| Total | Calculated/validated total | Qty × Price; do not blindly trust spreadsheet formula result |

## 3. Proposed logical tables

### 3.1 `die_models` — Master Dies

One row per Control Number.

| Field | Meaning |
|---|---|
| id | Internal primary key |
| control_number | Unique business identifier, e.g. 26X0034A |
| description | Die description |
| material | Die material |
| active | Whether the model is active |
| created_at, updated_at | System timestamps |

Constraint: unique `control_number`.

### 3.2 `customers`

One row per customer.

| Field | Meaning |
|---|---|
| id | Internal primary key |
| customer_name | Customer name from Excel |
| created_at, updated_at | System timestamps |

Constraint: customer name should be normalized for duplicate detection; final matching rule to be confirmed.

### 3.3 `order_import_batches`

One row per uploaded Excel file/import attempt.

| Field | Meaning |
|---|---|
| id | Internal primary key |
| file_name | Original uploaded filename |
| imported_by | User who uploaded the file |
| imported_at | Import timestamp |
| period | Month/period selected for the import |
| status | preview, completed, rejected, or failed |
| row_count, accepted_count, rejected_count | Import summary |

Purpose: prevent silent duplicate imports and preserve an audit trail.

### 3.4 `die_orders`

Represents an order record imported from a source row. The sample workbook does not show a PO number, so the system must not invent one.

| Field | Meaning |
|---|---|
| id | Internal primary key |
| import_batch_id | Source import batch |
| source_row_number | Original Excel row |
| po_date | Tanggal PO |
| due_date | Due date Delivery |
| customer_id | Customer |
| source_reference | Optional reference if a real PO/order number is added later |
| created_at | System timestamp |

### 3.5 `die_order_lines`

One order line connects an order to a die model and its ordered quantity.

| Field | Meaning |
|---|---|
| id | Internal primary key |
| die_order_id | Parent order |
| die_model_id | Control Number / die model |
| quantity | Number of physical dies ordered |
| unit_price | Price per die |
| total_price | Calculated quantity × unit price |
| description_snapshot | Description at order time |
| material_snapshot | Material at order time |

Validation: quantity is a positive integer; total must equal quantity × unit price. Snapshot fields preserve what was written on the order even if master data changes later.

### 3.6 `die_units` — Physical Unit Dies

One row per physical die unit, not one row per Control Number.

| Field | Meaning |
|---|---|
| id | Internal primary key |
| die_model_id | Parent die model / Control Number |
| order_line_id | Order line that created/received this unit, when known |
| unit_sequence | Sequence within the same model, e.g. 1, 2, 3; corresponds to the number after `#` |
| physical_unit_code | Exact identity written manually on the die, e.g. `26X0043 #1`; entered/confirmed by the user |
| status | Planned, received, available, in_use, maintenance, scrapped (final statuses to validate) |
| location | Current storage/machine location, when known |
| created_at, updated_at | System timestamps |

Constraint: `physical_unit_code` must be unique. Preserve the exact factory marking, including the `#` and unit number. Do not replace it with an automatically generated identifier. The Control Number remains the die model identity; the suffix (such as `#1`, `#2`) distinguishes each physical unit.

### 3.7 Operational history tables (next design iteration)

These will reference `die_units.id` so events are recorded against the exact physical unit:
- `die_usage_transactions`
- `die_inspections` and `die_inspection_items`
- `maintenance_work_orders`
- `repair_records`
- `downtime_events`
- `audit_logs`

Detailed fields and approval flows should be designed after the factory's real workflow is confirmed.

## 4. Import and validation flow

1. User selects the monthly `Order Manajemen` workbook.
2. DPCS reads the worksheet and maps the ten known columns.
3. Show a preview before saving.
4. Validate required values, dates, positive integer Qty, numeric price, and total calculation.
5. Check whether each Control Number already exists:
   - If yes, link the order line to the existing die model.
   - If no, propose a new die model using description and material from the row.
6. Check customer master for an existing customer or propose a new customer.
7. Detect possible duplicate imports using file/batch metadata and row-level comparison; ask for review rather than silently duplicating.
8. After user confirmation, save the batch, orders, and order lines.
9. Immediately create one physical-unit record per ordered quantity when the order is entered. Each record starts with status `ordered`/`planned`, not received or available. Capture the manually marked physical identity (for example, `26X0043 #1`) when it is known; do not invent a physical marking.
10. Show import results: accepted rows, rejected rows, duplicate warnings, total quantity, and total value.

## 5. Sample interpretation

| Control Number | Description | Material | Qty | Unit price | Total |
|---|---|---|---:|---:|---:|
| 26X0034A | Punch Knock Out | SKD11 | 3 | 1,500,000 | 4,500,000 |
| 26X0035A | Punch Trimming | YXR7 | 2 | 980,000 | 1,960,000 |

The sample therefore represents two order lines and five physical dies in total. It represents two die models, not five different Control Numbers.

## 6. Open decisions before implementation

1. At what point should individual unit records be created: when the order is entered, when it is approved, or when the dies are received?
2. Does the factory already mark the physical units with a serial/asset number, or should DPCS generate an internal unit code?
3. Does the source Excel contain a separate PO number in another worksheet/file, or is `Tanggal PO` currently the only PO reference?
4. Can the same Control Number have different descriptions/materials over time, or must those attributes remain fixed?
5. What exact die statuses and locations are used in the factory?

## 7. Important implementation note

This document is a draft logical model, not a deployed database. No application tables or production data have been created yet. Confirm the open decisions and factory workflows before implementing migrations or importing live records.
