-- ================================================
-- PEKOPETSHOP AUTH TRIGGER
-- ================================================
-- Automatically create user in public.users when auth.users is created
-- This allows Owner to create accounts from within the app
-- ================================================

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert into public.users table with metadata from auth.users
  INSERT INTO public.users (
    id,
    email,
    name,
    role,
    branch_id,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'cashier'),
    (NEW.raw_user_meta_data->>'branch_id')::UUID,
    COALESCE((NEW.raw_user_meta_data->>'is_active')::BOOLEAN, true),
    NOW(),
    NOW()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to execute function after user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Function to handle user updates (sync email changes, etc)
CREATE OR REPLACE FUNCTION handle_user_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Update email in public.users if changed in auth.users
  IF NEW.email <> OLD.email THEN
    UPDATE public.users
    SET email = NEW.email,
        updated_at = NOW()
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to sync user updates
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_user_update();

-- Function to handle user deletion
CREATE OR REPLACE FUNCTION handle_user_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Soft delete: set is_active to false instead of hard delete
  UPDATE public.users
  SET is_active = false,
      updated_at = NOW()
  WHERE id = OLD.id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to handle user deletion
DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_user_delete();

-- ================================================
-- COMMENTS
-- ================================================

COMMENT ON FUNCTION handle_new_user() IS
'Automatically creates a user record in public.users when a new auth.users record is created. Reads metadata (name, role, branch_id) from raw_user_meta_data.';

COMMENT ON FUNCTION handle_user_update() IS
'Syncs email changes from auth.users to public.users.';

COMMENT ON FUNCTION handle_user_delete() IS
'Soft deletes user in public.users when auth.users record is deleted.';

-- ================================================
-- END OF MIGRATION
-- ================================================
