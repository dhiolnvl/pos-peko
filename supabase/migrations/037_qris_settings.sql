CREATE TABLE IF NOT EXISTS qris_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_name TEXT NOT NULL,
  merchant_city TEXT NOT NULL DEFAULT '',
  qris_content  TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE qris_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qris_read_all" ON qris_settings FOR SELECT USING (true);
CREATE POLICY "qris_owner_write" ON qris_settings FOR ALL USING ((get_user_role())::text = 'owner');
