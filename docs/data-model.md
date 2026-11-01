# DPCS Data Model — Draft 1

**Scope:** One factory  
**Source process:** Monthly Excel file named `Order Manajemen`  
**Status:** Initial design based on the sample workbook; validate before application implementation.

## 1. Confirmed business rules

1. `Control Number` identifies a die model/order specification, not an individual physical unit. For a new order, different initial specifications (including different materials) require different Control Numbers. However, if the customer requests a specification change while production is already in progress, retain the same Control Number and create a new, separately traceable specification revision. Never overwrite the previous revision; preserve its values and change history. Multiple physical units under the order are linked to the applicable revision.
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
| material | Current approved specification material; retain prior values in specification revision history |
| active | Whether the model is active |
| created_at, updated_at | System timestamps |

Constraint: unique `control_number`. Do not use the general die type/description alone to merge different Control Numbers. A production-time customer specification change keeps the same Control Number but creates a new revision record.

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
| specification_revision_id | Specification revision applicable to this order line |

Validation: quantity is a positive integer; total must equal quantity × unit price. `material_snapshot` and `specification_revision_id` identify the exact specification applicable to the order line. For a new order with a different initial material/specification, use a different Control Number. If the customer changes the specification during production, keep the same Control Number and link the affected work/order line and units to the new revision. Snapshot fields preserve what was agreed at the time.

### 3.6 `die_units` — Physical Unit Dies

One row per physical die unit, not one row per Control Number.

| Field | Meaning |
|---|---|
| id | Internal primary key |
| die_model_id | Parent die model / Control Number |
| order_line_id | Order line that created/received this unit, when known |
| unit_sequence | Sequence within the same model, e.g. 1, 2, 3; corresponds to the number after `#` |
| physical_unit_code | Exact identity written manually on the die after manufacture, e.g. `26X0043 #1`; remains empty until marked and then entered/confirmed by the user |
| status | ordered/planned, manufactured, available, in_use, maintenance, scrapped (final statuses to validate) |
| location | Current storage/machine location, when known |
| created_at, updated_at | System timestamps |

Constraint: `physical_unit_code` must be unique. Preserve the exact factory marking, including the `#` and unit number. Do not replace it with an automatically generated identifier. The Control Number remains the die model identity; the suffix (such as `#1`, `#2`) distinguishes each physical unit.

### 3.7 `die_specification_revisions` — Specification change history

One row per approved specification revision under a Control Number.

| Field | Meaning |
|---|---|
| id | Internal primary key / revision ID |
| die_model_id | Control Number whose specification is being revised |
| revision_number | Sequential revision, e.g. 1, 2, 3 |
| change_request_date | Date the customer requested the change |
| change_reason | Reason/details of the requested change |
| previous_specification | Snapshot of the specification before the change |
| revised_specification | Snapshot of the new specification, including material where changed |
| recorded_by | User recording the change |
| approved_by | Head of Production (Kepala Produksi), the required approver for production-time specification changes |
| effective_at | Date/time the revision becomes effective |
| created_at | System timestamp |

Rules: retain the same Control Number for a customer-requested specification change made while that order is in production. The Head of Production (Kepala Produksi) must approve the change before it is applied on the shop floor. Create a new revision; never overwrite the old specification. Record the request, approval decision, approver, and timestamps. Record which revision applies to each affected order line, physical unit, and subsequent Workcard operation so the factory can distinguish work completed before and after the change.

### 3.8 Operational history tables (next design iteration)

These will reference `die_units.id` so events are recorded against the exact physical unit:
- `die_usage_transactions`
- `die_inspections` and `die_inspection_items` (optional inspection records, if the factory later requires them)
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
9. Immediately create one physical-unit record per ordered quantity when the order is entered. Each record starts with status `ordered`/`planned`, not received or available. Leave `physical_unit_code` empty until the die is manufactured and the factory marking (for example, `26X0043 #1`) is written; then enter the exact marking in DPCS.
10. Show import results: accepted rows, rejected rows, duplicate warnings, total quantity, and total value.


## 4. Actual shop-floor workflow (confirmed by factory)

1. Marketing prepares the Workcard and Control Number.
2. The die is processed through the departments/operations in sequence according to the Workcard. Actual scheduling and machine assignment may be adjusted based on machine availability, while preserving the required operation sequence and ensuring no required operation is skipped. A department may have multiple machines capable of performing the same type of operation; DPCS must maintain each machine as a separate resource and consider its availability when assigning work. DPCS should record the planned sequence, assigned machine (when applicable), and actual start/completion times for each operation.
3. For Control Numbers with multiple physical units, the Polishing team normally writes the physical unit marking (for example, `26X0043 #1`, `26X0043 #2`).
4. Polishing is usually the final operation before the die enters QC.
5. The Polishing operator reports polishing completion in DPCS and records the exact physical marking against the correct planned unit. The marking remains blank until it is physically written on the die.
6. The QC operator reports QC completion and records an individual result for each physical unit: `good` or `reject`. Never combine the QC result for multiple units into one record.
7. If a unit receives `reject`, repair is conditional:
   - If repair is feasible, record a repair activity for that unit. After repair is completed, the unit must go through QC again, with a new QC result record.
   - If repair is not feasible, record the unit as permanently rejected/scrapped according to the factory's final disposition.
8. Preserve the full event history for each physical unit, including the reporting operator, unit identity, Workcard operation, completion timestamp, QC result, and any repair activity. A later QC result must not overwrite an earlier result.
9. The Head of Production (Kepala Produksi) decides whether a rejected unit is feasible to repair or must be permanently rejected/scrapped. DPCS must record this decision, the decision-maker, and the timestamp.
10. When repair is approved, the repair work is performed by the department that previously worked on the die/unit. DPCS must assign and record the responsible department and the repair activity against that physical unit.

**Important distinction:** QC completion and its individual `good`/`reject` result are required operational records in DPCS. A `reject` result does not automatically mean repair; the Head of Production decides whether repair is feasible or the unit must be permanently rejected.

## 5. Sample interpretation

| Control Number | Description | Material | Qty | Unit price | Total |
|---|---|---|---:|---:|---:|
| 26X0034A | Punch Knock Out | SKD11 | 3 | 1,500,000 | 4,500,000 |
| 26X0035A | Punch Trimming | YXR7 | 2 | 980,000 | 1,960,000 |

The sample therefore represents two order lines and five physical dies in total. It represents two die models, not five different Control Numbers.

## 6. Open decisions before implementation

1. Does the source Excel contain a separate PO number in another worksheet/file, or is `Tanggal PO` currently the only PO reference?
2. What exact die statuses and locations are used in the factory?

## 7. Important implementation note

This document is a draft logical model, not a deployed database. No application tables or production data have been created yet. Confirm the open decisions and factory workflows before implementing migrations or importing live records.
