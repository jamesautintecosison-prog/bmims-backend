-- =====================================================================
-- 002_create_operational_tables.sql
-- BMIMS: operational tables and the three M:N junctions
-- Tables: staff_committee_assignments, service_requests, incident_reports,
--         incident_participants, health_programs, resident_program_enrollment
-- Depends on: 001_create_core_tables.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- staff_committee_assignments  (M:N  staff <-> committees)
-- ---------------------------------------------------------------------
CREATE TABLE staff_committee_assignments (
    assignment_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    staff_id      INT NOT NULL
        REFERENCES staff (staff_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    committee_id  INT NOT NULL
        REFERENCES committees (committee_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    role          VARCHAR(30)  NOT NULL DEFAULT 'Member'
        CHECK (role IN ('Chairperson', 'Secretary', 'Member')),
    assigned_date DATE         NOT NULL DEFAULT CURRENT_DATE,
    hours_logged  NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (hours_logged >= 0),
    CONSTRAINT uq_staff_committee UNIQUE (staff_id, committee_id)
);

-- ---------------------------------------------------------------------
-- service_requests
-- reference_number, issued_by_staff_id and date_released stay NULL until
-- the request is released (set by sp_issue_certificate later).
-- ---------------------------------------------------------------------
CREATE TABLE service_requests (
    request_id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    resident_id        INT NOT NULL
        REFERENCES residents (resident_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    doc_type_id        INT NOT NULL
        REFERENCES document_types (doc_type_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    committee_id       INT NOT NULL
        REFERENCES committees (committee_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    issued_by_staff_id INT
        REFERENCES staff (staff_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    status             VARCHAR(20) NOT NULL DEFAULT 'Pending'
        CHECK (status IN ('Pending', 'Processing', 'Approved', 'Released', 'Rejected')),
    reference_number   VARCHAR(30) UNIQUE,
    date_requested     TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_released      TIMESTAMPTZ,
    CONSTRAINT chk_request_dates
        CHECK (date_released IS NULL OR date_released >= date_requested),
    CONSTRAINT chk_request_released_complete
        CHECK (
            status <> 'Released'
            OR (reference_number IS NOT NULL
                AND issued_by_staff_id IS NOT NULL
                AND date_released IS NOT NULL)
        )
);

-- ---------------------------------------------------------------------
-- incident_reports
-- handled_by_staff_id is NULL until a staff member picks up the case.
-- ---------------------------------------------------------------------
CREATE TABLE incident_reports (
    incident_id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    committee_id       INT NOT NULL
        REFERENCES committees (committee_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    handled_by_staff_id INT
        REFERENCES staff (staff_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    date_filed         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    location           VARCHAR(255) NOT NULL,
    description        TEXT         NOT NULL,
    status             VARCHAR(25)  NOT NULL DEFAULT 'Open'
        CHECK (status IN ('Open', 'Under Investigation', 'Settled', 'Escalated', 'Closed'))
);

-- ---------------------------------------------------------------------
-- incident_participants  (M:N  incident_reports <-> residents)
-- Participants belong to the incident, so they are removed with it.
-- ---------------------------------------------------------------------
CREATE TABLE incident_participants (
    participant_id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    incident_id      INT NOT NULL
        REFERENCES incident_reports (incident_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    resident_id      INT NOT NULL
        REFERENCES residents (resident_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    participant_role VARCHAR(20) NOT NULL
        CHECK (participant_role IN ('complainant', 'respondent', 'witness')),
    statement        TEXT,
    CONSTRAINT uq_incident_resident_role
        UNIQUE (incident_id, resident_id, participant_role)
);

-- ---------------------------------------------------------------------
-- health_programs
-- ---------------------------------------------------------------------
CREATE TABLE health_programs (
    program_id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    committee_id INT NOT NULL
        REFERENCES committees (committee_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    program_name VARCHAR(120) NOT NULL,
    description  TEXT,
    start_date   DATE NOT NULL,
    end_date     DATE,
    CONSTRAINT chk_program_dates CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT uq_program_per_committee UNIQUE (committee_id, program_name)
);

-- ---------------------------------------------------------------------
-- resident_program_enrollment  (M:N  residents <-> health_programs)
-- ---------------------------------------------------------------------
CREATE TABLE resident_program_enrollment (
    enrollment_id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    resident_id     INT NOT NULL
        REFERENCES residents (resident_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    program_id      INT NOT NULL
        REFERENCES health_programs (program_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    enrollment_date DATE        NOT NULL DEFAULT CURRENT_DATE,
    status          VARCHAR(20) NOT NULL DEFAULT 'Enrolled'
        CHECK (status IN ('Enrolled', 'Completed', 'Dropped')),
    CONSTRAINT uq_resident_program UNIQUE (resident_id, program_id)
);

-- FK lookup indexes (PostgreSQL does not create these automatically)
CREATE INDEX idx_requests_resident     ON service_requests (resident_id);
CREATE INDEX idx_requests_committee    ON service_requests (committee_id);
CREATE INDEX idx_incidents_committee   ON incident_reports (committee_id);
CREATE INDEX idx_participants_resident ON incident_participants (resident_id);
CREATE INDEX idx_programs_committee    ON health_programs (committee_id);
CREATE INDEX idx_enrollment_program    ON resident_program_enrollment (program_id);

COMMIT;
