-- =====================================================================
-- 003_create_budget_and_audit_tables.sql
-- BMIMS: budget tracking and audit trail
-- Tables: committee_budgets, expense_logs, audit_logs
-- Depends on: 001, 002
-- Note: remaining_amount is maintained by a trigger on expense_logs
--       (written in the Week 5 routines migration), not by the app.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- committee_budgets  (one budget row per committee per fiscal year)
-- ---------------------------------------------------------------------
CREATE TABLE committee_budgets (
    budget_id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    committee_id     INT NOT NULL
        REFERENCES committees (committee_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    fiscal_year      VARCHAR(4)    NOT NULL CHECK (fiscal_year ~ '^[0-9]{4}$'),
    allocated_amount NUMERIC(14,2) NOT NULL CHECK (allocated_amount >= 0),
    remaining_amount NUMERIC(14,2) NOT NULL,
    CONSTRAINT uq_budget_committee_year UNIQUE (committee_id, fiscal_year),
    CONSTRAINT chk_remaining_not_negative CHECK (remaining_amount >= 0),
    CONSTRAINT chk_remaining_within_allocation CHECK (remaining_amount <= allocated_amount)
);

-- ---------------------------------------------------------------------
-- expense_logs
-- ---------------------------------------------------------------------
CREATE TABLE expense_logs (
    expense_id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    budget_id            INT NOT NULL
        REFERENCES committee_budgets (budget_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    approved_by_staff_id INT NOT NULL
        REFERENCES staff (staff_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    description          TEXT          NOT NULL,
    amount               NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    date_incurred        DATE          NOT NULL DEFAULT CURRENT_DATE
);

-- ---------------------------------------------------------------------
-- audit_logs
-- Rows are written by database triggers only. changed_by_user_id is NULL
-- when the change was made outside the app (e.g. a DBA in a SQL client).
-- Old/new row snapshots are stored as JSONB.
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
    audit_id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    changed_by_user_id INT
        REFERENCES users (user_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    table_name         VARCHAR(63) NOT NULL,
    record_id          INT         NOT NULL,
    action_type        VARCHAR(10) NOT NULL
        CHECK (action_type IN ('INSERT', 'UPDATE', 'DELETE')),
    old_value          JSONB,
    new_value          JSONB,
    logged_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_audit_values CHECK (
        (action_type = 'INSERT' AND old_value IS NULL     AND new_value IS NOT NULL)
     OR (action_type = 'UPDATE' AND old_value IS NOT NULL AND new_value IS NOT NULL)
     OR (action_type = 'DELETE' AND old_value IS NOT NULL AND new_value IS NULL)
    )
);

-- Lookup indexes
CREATE INDEX idx_expenses_budget      ON expense_logs (budget_id);
CREATE INDEX idx_expenses_date        ON expense_logs (date_incurred);
CREATE INDEX idx_audit_table_record   ON audit_logs (table_name, record_id);
CREATE INDEX idx_audit_logged_at      ON audit_logs (logged_at);
CREATE INDEX idx_audit_user           ON audit_logs (changed_by_user_id);

COMMIT;
