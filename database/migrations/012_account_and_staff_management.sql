-- =====================================================================
-- 012_account_and_staff_management.sql
-- BMIMS: change-own-password and remove-staff, enforced in the database
--   app_user_id()                        who is calling (login account id)
--   sp_change_own_password(new_hash)     any signed-in user, own row only
--   sp_remove_staff(staff_id)            admin only
-- No tables or columns change. Depends on: 001-011
--
-- Both functions are SECURITY DEFINER with a pinned search_path and do
-- their own authorization from the session values the API sets.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION app_user_id() RETURNS INT
LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.user_id', true), '')::INT $$;

-- ---------------------------------------------------------------------
-- sp_change_own_password
-- The API checks the CURRENT password (bcrypt) and sends the NEW bcrypt
-- hash. The database only ever updates the caller's own account.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_change_own_password(p_new_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user INT := app_user_id();
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_new_hash IS NULL OR p_new_hash !~ '^\$2[aby]\$[0-9]{2}\$.{53}$' THEN
        RAISE EXCEPTION 'Invalid password hash';
    END IF;

    UPDATE users SET password_hash = p_new_hash WHERE user_id = v_user;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account not found';
    END IF;

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------
-- sp_remove_staff
-- 1. only an admin account may call it
-- 2. nobody can remove their own account, or the last admin
-- 3. the staff member's login and committee assignments are removed
-- 4. the staff record itself is deleted only if nothing refers to it;
--    if it issued certificates or approved expenses it is kept for the
--    audit trail and 'access_removed' is returned instead of 'deleted'
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_remove_staff(p_staff_id INT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_user  INT := app_user_id();
    v_caller_staff INT;
    v_admin_count  INT;
BEGIN
    IF v_caller_user IS NULL
       OR NOT EXISTS (SELECT 1 FROM users WHERE user_id = v_caller_user AND role = 'admin') THEN
        RAISE EXCEPTION 'Only admins can remove staff';
    END IF;

    SELECT staff_id INTO v_caller_staff FROM users WHERE user_id = v_caller_user;
    IF p_staff_id = v_caller_staff THEN
        RAISE EXCEPTION 'You cannot remove your own account';
    END IF;

    PERFORM 1 FROM staff WHERE staff_id = p_staff_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff % does not exist', p_staff_id;
    END IF;

    IF EXISTS (SELECT 1 FROM users WHERE staff_id = p_staff_id AND role = 'admin') THEN
        SELECT count(*) INTO v_admin_count FROM users WHERE role = 'admin';
        IF v_admin_count <= 1 THEN
            RAISE EXCEPTION 'Cannot remove the last admin account';
        END IF;
    END IF;

    DELETE FROM users WHERE staff_id = p_staff_id;
    DELETE FROM staff_committee_assignments WHERE staff_id = p_staff_id;

    BEGIN
        DELETE FROM staff WHERE staff_id = p_staff_id;
        RETURN 'deleted';
    EXCEPTION WHEN foreign_key_violation THEN
        -- history (issued certificates, approved expenses, handled incidents) keeps the row
        RETURN 'access_removed';
    END;
END;
$$;

REVOKE ALL ON FUNCTION sp_change_own_password(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sp_change_own_password(TEXT) TO admin_role, staff_role, resident_role;

REVOKE ALL ON FUNCTION sp_remove_staff(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sp_remove_staff(INT) TO admin_role;

COMMIT;
