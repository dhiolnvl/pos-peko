-- ================================================
-- 017: Member menjadi global (tidak terikat cabang)
-- ================================================

-- Hapus foreign key constraint branch_id dari members
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_branch_id_fkey;

-- Set branch_id nullable (sudah nullable, tapi pastikan)
ALTER TABLE members ALTER COLUMN branch_id DROP NOT NULL;

-- Update RLS: semua authenticated user bisa baca/tulis member
DROP POLICY IF EXISTS "branch staff members access" ON members;

CREATE POLICY "authenticated read members" ON members
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated write members" ON members
  FOR ALL USING (auth.role() = 'authenticated');
