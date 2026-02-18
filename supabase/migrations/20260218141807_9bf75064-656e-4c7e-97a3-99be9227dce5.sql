-- Drop restrictive policies and recreate as permissive
DROP POLICY IF EXISTS "Admins can view all store access" ON public.user_store_access;
DROP POLICY IF EXISTS "Users can view own store access" ON public.user_store_access;
DROP POLICY IF EXISTS "Users can insert own store access" ON public.user_store_access;
DROP POLICY IF EXISTS "Admins can update store access" ON public.user_store_access;
DROP POLICY IF EXISTS "Admins can delete store access" ON public.user_store_access;

-- Recreate as PERMISSIVE (default)
CREATE POLICY "Admins can view all store access"
ON public.user_store_access FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own store access"
ON public.user_store_access FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own store access"
ON public.user_store_access FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update store access"
ON public.user_store_access FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete store access"
ON public.user_store_access FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Also fix checklist_answers and checklist_submissions which have same issue
DROP POLICY IF EXISTS "Admins can view all answers" ON public.checklist_answers;
DROP POLICY IF EXISTS "Users can view own answers" ON public.checklist_answers;
DROP POLICY IF EXISTS "Users can insert own answers" ON public.checklist_answers;

CREATE POLICY "Admins can view all answers"
ON public.checklist_answers FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own answers"
ON public.checklist_answers FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM checklist_submissions s WHERE s.id = checklist_answers.submission_id AND s.user_id = auth.uid()));

CREATE POLICY "Users can insert own answers"
ON public.checklist_answers FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM checklist_submissions s WHERE s.id = checklist_answers.submission_id AND s.user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins can view all submissions" ON public.checklist_submissions;
DROP POLICY IF EXISTS "Users can view own submissions" ON public.checklist_submissions;
DROP POLICY IF EXISTS "Users can insert own submissions" ON public.checklist_submissions;

CREATE POLICY "Admins can view all submissions"
ON public.checklist_submissions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own submissions"
ON public.checklist_submissions FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own submissions"
ON public.checklist_submissions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Fix checklist_questions policies
DROP POLICY IF EXISTS "Admins can manage questions" ON public.checklist_questions;
DROP POLICY IF EXISTS "Admins can insert questions" ON public.checklist_questions;
DROP POLICY IF EXISTS "Admins can update questions" ON public.checklist_questions;
DROP POLICY IF EXISTS "Admins can delete questions" ON public.checklist_questions;
DROP POLICY IF EXISTS "Authenticated can view questions" ON public.checklist_questions;

CREATE POLICY "Admins can manage questions"
ON public.checklist_questions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view questions"
ON public.checklist_questions FOR SELECT TO authenticated
USING (true);

-- Fix departments policies
DROP POLICY IF EXISTS "Admins can manage departments" ON public.departments;
DROP POLICY IF EXISTS "Authenticated can view departments" ON public.departments;

CREATE POLICY "Admins can manage departments"
ON public.departments FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view departments"
ON public.departments FOR SELECT TO authenticated
USING (true);

-- Fix stores policies
DROP POLICY IF EXISTS "Authenticated can view stores" ON public.stores;

CREATE POLICY "Authenticated can view stores"
ON public.stores FOR SELECT TO authenticated
USING (true);

-- Fix profiles policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

-- Fix user_roles policies
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert own roles" ON public.user_roles;

CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);