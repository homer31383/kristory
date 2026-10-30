-- 035: Book Builder tables keep only select, insert, update, delete.
--
-- 034 granted those four to authenticated and service_role but did not take
-- away truncate, references and trigger. Revoke them from authenticated,
-- anon and public. Already applied by hand on the live database; revoke is
-- a no-op when the privilege is not held, so this is safe to run again.
-- Grants to service_role and the household_only policies are unchanged.

revoke truncate, references, trigger on public.book_books from authenticated, anon, public;
revoke truncate, references, trigger on public.book_items from authenticated, anon, public;
