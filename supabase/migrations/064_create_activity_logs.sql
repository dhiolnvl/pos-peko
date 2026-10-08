-- ================================================
-- 064: CREATE ACTIVITY LOGS TABLE & RPC
-- ================================================

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name VARCHAR(255) NOT NULL,
  user_role VARCHAR(50) NOT NULL,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  branch_name VARCHAR(255),
  action VARCHAR(100) NOT NULL,
  action_type VARCHAR(50) NOT NULL DEFAULT 'system',
  description TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing for quick querying & filtering
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action_type ON activity_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_branch_id ON activity_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);

-- Enable RLS
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Drop policies if exist to prevent conflict
DROP POLICY IF EXISTS "Allow authenticated to insert activity_logs" ON activity_logs;
DROP POLICY IF EXISTS "Allow users to view activity_logs" ON activity_logs;

-- Insert policy for all authenticated users
CREATE POLICY "Allow authenticated to insert activity_logs"
  ON activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Select policy: Owners can see all logs; Back Office / Cashier can see their branch logs
CREATE POLICY "Allow users to view activity_logs"
  ON activity_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND (
        users.role = 'owner'
        OR users.role = 'staff_pusat'
        OR users.branch_id = activity_logs.branch_id
      )
    )
  );

-- Function RPC for logging activity
CREATE OR REPLACE FUNCTION log_activity(
  p_user_id UUID,
  p_user_name VARCHAR,
  p_user_role VARCHAR,
  p_action VARCHAR,
  p_action_type VARCHAR DEFAULT 'system',
  p_description TEXT DEFAULT '',
  p_branch_id UUID DEFAULT NULL,
  p_branch_name VARCHAR DEFAULT NULL,
  p_details JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO activity_logs (
    user_id,
    user_name,
    user_role,
    action,
    action_type,
    description,
    branch_id,
    branch_name,
    details
  ) VALUES (
    p_user_id,
    COALESCE(p_user_name, 'Pengguna'),
    COALESCE(p_user_role, 'user'),
    p_action,
    COALESCE(p_action_type, 'system'),
    p_description,
    p_branch_id,
    p_branch_name,
    p_details
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- Function RPC for owner to fetch logs with filters
CREATE OR REPLACE FUNCTION get_activity_logs(
  p_branch_id UUID DEFAULT NULL,
  p_action_type VARCHAR DEFAULT NULL,
  p_search VARCHAR DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_name VARCHAR,
  user_role VARCHAR,
  branch_id UUID,
  branch_name VARCHAR,
  action VARCHAR,
  action_type VARCHAR,
  description TEXT,
  details JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.user_id,
    l.user_name,
    l.user_role,
    l.branch_id,
    l.branch_name,
    l.action,
    l.action_type,
    l.description,
    l.details,
    l.created_at
  FROM activity_logs l
  WHERE
    (p_branch_id IS NULL OR l.branch_id = p_branch_id)
    AND (p_action_type IS NULL OR p_action_type = '' OR p_action_type = 'all' OR l.action_type = p_action_type)
    AND (
      p_search IS NULL OR p_search = '' OR
      l.description ILIKE '%' || p_search || '%' OR
      l.user_name ILIKE '%' || p_search || '%' OR
      l.action ILIKE '%' || p_search || '%' OR
      COALESCE(l.branch_name, '') ILIKE '%' || p_search || '%'
    )
  ORDER BY l.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
