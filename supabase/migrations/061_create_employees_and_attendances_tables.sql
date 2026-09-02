-- ================================================
-- MIGRATION 061: CREATE EMPLOYEES & ATTENDANCES TABLES AND RLS POLICIES
-- Fixes missing 'employees' and 'attendances' tables for Employee & Attendance Management
-- ================================================

-- 1. CREATE TABLE employees
CREATE TABLE IF NOT EXISTS employees (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  branch_id  UUID         REFERENCES branches(id) ON DELETE SET NULL,
  pin        VARCHAR(20)  NOT NULL,
  position   VARCHAR(100),
  is_active  BOOLEAN      NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 2. CREATE TABLE attendances
CREATE TABLE IF NOT EXISTS attendances (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date                DATE        NOT NULL,
  check_in            TIMESTAMPTZ,
  check_in_branch_id  UUID        REFERENCES branches(id) ON DELETE SET NULL,
  check_out           TIMESTAMPTZ,
  check_out_branch_id UUID        REFERENCES branches(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_attendances_employee_date UNIQUE (employee_id, date)
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_employees_branch     ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_active     ON employees(is_active);
CREATE INDEX IF NOT EXISTS idx_attendances_date     ON attendances(date);
CREATE INDEX IF NOT EXISTS idx_attendances_employee ON attendances(employee_id);

-- 4. TRIGGER FOR UPDATED_AT
CREATE OR REPLACE FUNCTION update_employees_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_employees_updated_at ON employees;
CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_employees_updated_at();

DROP TRIGGER IF EXISTS trg_attendances_updated_at ON attendances;
CREATE TRIGGER trg_attendances_updated_at
  BEFORE UPDATE ON attendances
  FOR EACH ROW EXECUTE FUNCTION update_employees_updated_at();

-- 5. ENABLE ROW LEVEL SECURITY
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employees_all_authenticated" ON employees;
DROP POLICY IF EXISTS "attendances_all_authenticated" ON attendances;

CREATE POLICY "employees_all_authenticated" ON employees FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (get_user_role() IN ('owner', 'staff_pusat', 'back_office'));

CREATE POLICY "attendances_all_authenticated" ON attendances FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT ALL ON employees TO authenticated;
GRANT ALL ON attendances TO authenticated;

-- 6. SEED INITIAL SAMPLE EMPLOYEES
INSERT INTO employees (id, name, branch_id, pin, position, is_active)
SELECT
  'e0000000-0000-4000-a000-000000000001'::UUID,
  'Budi Santoso',
  b.id,
  '1234',
  'Staff Kasir & Toko',
  true
FROM branches b LIMIT 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO employees (id, name, branch_id, pin, position, is_active)
SELECT
  'e0000000-0000-4000-a000-000000000002'::UUID,
  'Siti Aminah',
  b.id,
  '5678',
  'Kasir Cabang',
  true
FROM branches b LIMIT 1
ON CONFLICT (id) DO NOTHING;
