-- =====================================================================
-- 001_seed_sample_data.sql
-- BMIMS: sample data for demos and row-level-security tests
-- Run ONCE as the owner, after migrations 001-005.
-- Explicit ids are used so the RLS tests have predictable results;
-- identity sequences are advanced at the end.
-- User accounts are NOT seeded: the API creates them with hashed passwords.
-- =====================================================================

BEGIN;

-- Households (head_resident_id is set after residents exist)
INSERT INTO households (household_id, address) OVERRIDING SYSTEM VALUE VALUES
    (1, 'Purok 1, Barangay Mahayag'),
    (2, 'Purok 2, Barangay Mahayag'),
    (3, 'Purok 3, Barangay Mahayag');

-- Residents
INSERT INTO residents
    (resident_id, household_id, first_name, last_name, birth_date, gender, contact_number, resident_status)
OVERRIDING SYSTEM VALUE VALUES
    (1, 1,    'Juan',   'Dela Cruz', '1985-03-12', 'Male',   '09171234501', 'Active'),
    (2, 1,    'Maria',  'Dela Cruz', '1987-07-25', 'Female', '09171234502', 'Active'),
    (3, 2,    'Pedro',  'Santos',    '1979-11-02', 'Male',   '09171234503', 'Active'),
    (4, 2,    'Ana',    'Santos',    '1982-01-18', 'Female', '09171234504', 'Active'),
    (5, 3,    'Jose',   'Reyes',     '1975-05-30', 'Male',   '09171234505', 'Active'),
    (6, 3,    'Luz',    'Reyes',     '1978-09-14', 'Female', '09171234506', 'Active'),
    (7, 3,    'Carlo',  'Reyes',     '2001-12-05', 'Male',   NULL,          'Active'),
    (8, NULL, 'Elena',  'Bautista',  '1990-06-21', 'Female', '09171234508', 'Active');

UPDATE households SET head_resident_id = 1 WHERE household_id = 1;
UPDATE households SET head_resident_id = 3 WHERE household_id = 2;
UPDATE households SET head_resident_id = 5 WHERE household_id = 3;

-- Staff
INSERT INTO staff (staff_id, first_name, last_name, position, date_hired)
OVERRIDING SYSTEM VALUE VALUES
    (1, 'Ramon',   'Garcia',     'Punong Barangay',      '2023-01-02'),
    (2, 'Teresa',  'Villanueva', 'Barangay Secretary',   '2023-01-02'),
    (3, 'Roberto', 'Mendoza',    'Kagawad - Health',     '2023-01-02'),
    (4, 'Lourdes', 'Aquino',     'Kagawad - Peace and Order', '2023-01-02');

-- Committees
INSERT INTO committees (committee_id, committee_name, description)
OVERRIDING SYSTEM VALUE VALUES
    (1, 'Health',          'Health programs and services'),
    (2, 'Peace and Order', 'Blotter, mediation, and public safety'),
    (3, 'Education',       'Education and livelihood programs');

-- Staff <-> committee assignments (M:N with intersection attributes)
INSERT INTO staff_committee_assignments
    (assignment_id, staff_id, committee_id, role, assigned_date, hours_logged)
OVERRIDING SYSTEM VALUE VALUES
    (1, 3, 1, 'Chairperson', '2023-01-09', 12.5),
    (2, 4, 2, 'Chairperson', '2023-01-09', 20.0),
    (3, 2, 3, 'Secretary',   '2023-01-09',  8.0);

-- Document types
INSERT INTO document_types (doc_type_id, name, description, fee_amount)
OVERRIDING SYSTEM VALUE VALUES
    (1, 'Barangay Clearance',        'General purpose clearance',        50.00),
    (2, 'Certificate of Indigency',  'For assistance and scholarships',   0.00),
    (3, 'Business Permit',           'Barangay business clearance',     300.00),
    (4, 'Certificate of Residency',  'Proof of residence',               30.00);

-- Service requests (request 3 is already released)
INSERT INTO service_requests
    (request_id, resident_id, doc_type_id, committee_id, issued_by_staff_id,
     status, reference_number, date_requested, date_released)
OVERRIDING SYSTEM VALUE VALUES
    (1, 1, 1, 2, NULL, 'Pending',    NULL,             now(), NULL),
    (2, 2, 2, 1, NULL, 'Pending',    NULL,             now(), NULL),
    (3, 3, 4, 2, 4,    'Released',   'BRGY-2026-0001', now(), now()),
    (4, 5, 2, 1, NULL, 'Processing', NULL,             now(), NULL);

-- Incident reports and participants
INSERT INTO incident_reports
    (incident_id, committee_id, handled_by_staff_id, location, description, status)
OVERRIDING SYSTEM VALUE VALUES
    (1, 2, 4,    'Purok 3', 'Noise complaint after curfew',   'Under Investigation'),
    (2, 2, NULL, 'Purok 2', 'Boundary fence dispute',         'Open');

INSERT INTO incident_participants
    (participant_id, incident_id, resident_id, participant_role, statement)
OVERRIDING SYSTEM VALUE VALUES
    (1, 1, 1, 'complainant', 'Loud music until midnight.'),
    (2, 1, 3, 'respondent',  NULL),
    (3, 1, 5, 'witness',     'Heard the music from my house.'),
    (4, 2, 6, 'complainant', 'Fence was moved onto our lot.'),
    (5, 2, 3, 'respondent',  NULL);

-- Health programs and enrollments
INSERT INTO health_programs
    (program_id, committee_id, program_name, description, start_date, end_date)
OVERRIDING SYSTEM VALUE VALUES
    (1, 1, 'Free Vaccination Drive',  'Community vaccination',      '2026-10-01', '2026-12-31'),
    (2, 1, 'Maternal Health Seminar', 'Seminar for expecting mothers', '2026-11-15', NULL),
    (3, 3, 'Livelihood Training',     'Skills training program',    '2026-10-15', '2026-11-30');

INSERT INTO resident_program_enrollment
    (enrollment_id, resident_id, program_id, enrollment_date, status)
OVERRIDING SYSTEM VALUE VALUES
    (1, 2, 1, '2026-10-02', 'Enrolled'),
    (2, 4, 1, '2026-10-02', 'Enrolled'),
    (3, 1, 2, '2026-10-03', 'Enrolled'),
    (4, 6, 3, '2026-10-03', 'Enrolled');

-- Committee budgets for 2026 (no expenses yet: the trigger will deduct them)
INSERT INTO committee_budgets
    (budget_id, committee_id, fiscal_year, allocated_amount, remaining_amount)
OVERRIDING SYSTEM VALUE VALUES
    (1, 1, '2026', 100000.00, 100000.00),
    (2, 2, '2026',  80000.00,  80000.00),
    (3, 3, '2026',  60000.00,  60000.00);

-- Advance identity sequences past the explicit ids
SELECT setval(pg_get_serial_sequence('households','household_id'),               (SELECT max(household_id) FROM households));
SELECT setval(pg_get_serial_sequence('residents','resident_id'),                 (SELECT max(resident_id) FROM residents));
SELECT setval(pg_get_serial_sequence('staff','staff_id'),                        (SELECT max(staff_id) FROM staff));
SELECT setval(pg_get_serial_sequence('committees','committee_id'),               (SELECT max(committee_id) FROM committees));
SELECT setval(pg_get_serial_sequence('staff_committee_assignments','assignment_id'), (SELECT max(assignment_id) FROM staff_committee_assignments));
SELECT setval(pg_get_serial_sequence('document_types','doc_type_id'),            (SELECT max(doc_type_id) FROM document_types));
SELECT setval(pg_get_serial_sequence('service_requests','request_id'),           (SELECT max(request_id) FROM service_requests));
SELECT setval(pg_get_serial_sequence('incident_reports','incident_id'),          (SELECT max(incident_id) FROM incident_reports));
SELECT setval(pg_get_serial_sequence('incident_participants','participant_id'),  (SELECT max(participant_id) FROM incident_participants));
SELECT setval(pg_get_serial_sequence('health_programs','program_id'),            (SELECT max(program_id) FROM health_programs));
SELECT setval(pg_get_serial_sequence('resident_program_enrollment','enrollment_id'), (SELECT max(enrollment_id) FROM resident_program_enrollment));
SELECT setval(pg_get_serial_sequence('committee_budgets','budget_id'),           (SELECT max(budget_id) FROM committee_budgets));

COMMIT;
