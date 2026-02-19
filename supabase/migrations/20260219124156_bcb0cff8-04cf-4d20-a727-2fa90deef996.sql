
-- Fix: Users can grant themselves admin access
-- The handle_new_user trigger (SECURITY DEFINER) handles inserting the default 'user' role,
-- so we can safely restrict direct INSERT to admins only.
DROP POLICY IF EXISTS "Users can insert own roles" ON public.user_roles;

CREATE POLICY "Only admins can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
