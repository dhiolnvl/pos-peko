-- ================================================
-- Fix: PostgREST "Could not find a relationship between
-- 'members' and 'branches' in the schema cache"
--
-- Migration 017 menghapus FK members.branch_id -> branches.id
-- agar member jadi global. Tapi tanpa FK, PostgREST tidak bisa
-- resolve embed `branches(name)` yang dipakai di lib/memberQueries.ts.
--
-- Solusi: tambahkan kembali FK, tapi dengan ON DELETE SET NULL
-- (bukan CASCADE) — member tetap global, tidak ikut terhapus
-- kalau cabang dihapus.
-- ================================================

ALTER TABLE members
  ADD CONSTRAINT members_branch_id_fkey
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
