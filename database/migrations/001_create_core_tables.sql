-- =====================================================================
-- 001_create_core_tables.sql
-- BMIMS: core entity tables (PostgreSQL)
-- Tables: households, residents, staff, committees, document_types, users
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- households
-- head_resident_id FK is added after residents exists (circular reference)
-- ---------------------------------------------------------------------
CREATE TABLE households (
    household_id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    head_resident_id INT,
    address          VARCHAR(255) NOT NULL,
    date_registered  DATE         NOT NULL DEFAULT CURRENT_DATE
);

-- ---------------------------------------------------------------------
-- residents
-- household_id is nullable: a dissolved household clears the link only,
-- the resident (and their history) stays.
-- ---------------------------------------------------------------------
CREATE TABLE residents (
    resident_id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    household_id    INT
        REFERENCES households (household_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    first_name      VARCHAR(60) NOT NULL,
    last_name       VARCHAR(60) NOT NULL,
    birth_date      DATE        NOT NULL CHECK (birth_date <= CURRENT_DATE),
    gender          VARCHAR(10) NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
    contact_number  VARCHAR(20),
    resident_status VARCHAR(20) NOT NULL DEFAULT 'Active'
        CHECK (resident_status IN ('Active', 'Inactive', 'Transferred', 'Deceased'))
);

ALTER TABLE households
    ADD CONSTRAINT fk_households_head_resident
    FOREIGN KEY (head_resident_id)
    REFERENCES residents (resident_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- staff
-- ---------------------------------------------------------------------
CREATE TABLE staff (
    staff_id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name VARCHAR(60) NOT NULL,
    last_name  VARCHAR(60) NOT NULL,
    position   VARCHAR(60) NOT NULL,
    date_hired DATE        NOT NULL DEFAULT CURRENT_DATE
);

-- ---------------------------------------------------------------------
-- committees
-- ---------------------------------------------------------------------
CREATE TABLE committees (
    committee_id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    committee_name VARCHAR(100) NOT NULL UNIQUE,
    description    TEXT
);

-- ---------------------------------------------------------------------
-- document_types
-- ---------------------------------------------------------------------
CREATE TABLE document_types (
    doc_type_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(100)  NOT NULL UNIQUE,
    description TEXT,
    fee_amount  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0)
);

-- ---------------------------------------------------------------------
-- users (login accounts)
-- Each account belongs to exactly one staff member OR one resident,
-- and the role must match which one it is.
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    staff_id      INT UNIQUE
        REFERENCES staff (staff_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    resident_id   INT UNIQUE
        REFERENCES residents (resident_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  NOT NULL CHECK (role IN ('admin', 'staff', 'resident')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_users_one_owner
        CHECK ((staff_id IS NOT NULL)::int + (resident_id IS NOT NULL)::int = 1),
    CONSTRAINT chk_users_role_matches_owner
        CHECK (
            (role = 'resident' AND resident_id IS NOT NULL)
            OR (role IN ('admin', 'staff') AND staff_id IS NOT NULL)
        )
);

-- Index the FK columns used for joins
CREATE INDEX idx_residents_household ON residents (household_id);
CREATE INDEX idx_households_head     ON households (head_resident_id);

COMMIT;
