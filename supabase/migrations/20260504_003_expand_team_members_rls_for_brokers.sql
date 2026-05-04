-- Allow brokers to manage their own rows in team_members.
-- We deliberately do NOT rename lawyer_id -> owner_id: the lawyer portal hits the
-- same shared DB and any rename would break it. The column name is treated as a
-- generic "owner" identifier going forward; semantic cleanup can come later.

DROP POLICY IF EXISTS team_members_broker_all ON public.team_members;

CREATE POLICY team_members_broker_all
  ON public.team_members FOR ALL
  USING (
    lawyer_id = auth.uid()
    AND public.current_user_is_broker()
  )
  WITH CHECK (
    lawyer_id = auth.uid()
    AND public.current_user_is_broker()
  );

NOTIFY pgrst, 'reload schema';
