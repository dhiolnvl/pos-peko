CREATE TABLE IF NOT EXISTS transfer_settings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name     TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name  TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE transfer_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transfer_read_all" ON transfer_settings FOR SELECT USING (true);
CREATE POLICY "transfer_owner_write" ON transfer_settings FOR ALL USING ((get_user_role())::text = 'owner');
