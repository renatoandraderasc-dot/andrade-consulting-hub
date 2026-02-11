
-- Allow newly created users to insert their own roles (needed for admin setup)
CREATE POLICY "Users can insert own roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Allow admins to manage all questions (INSERT, UPDATE, DELETE separately for clarity)
CREATE POLICY "Admins can insert questions" ON public.checklist_questions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update questions" ON public.checklist_questions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete questions" ON public.checklist_questions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
