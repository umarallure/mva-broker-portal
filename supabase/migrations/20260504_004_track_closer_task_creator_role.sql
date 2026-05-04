-- Snapshot the creator's app_users.role onto each closer_tasks row so the sales
-- rep portal can distinguish broker-originated tasks from admin-/agent-created
-- ones. Trigger-populated to make it tamper-resistant and survive role changes
-- after the fact.

ALTER TABLE public.closer_tasks
  ADD COLUMN IF NOT EXISTS created_by_role text;

CREATE INDEX IF NOT EXISTS idx_closer_tasks_created_by_role
  ON public.closer_tasks(created_by_role);

CREATE OR REPLACE FUNCTION public.set_closer_task_creator_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    SELECT role
    INTO NEW.created_by_role
    FROM public.app_users
    WHERE user_id = NEW.created_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_closer_task_creator_role ON public.closer_tasks;

CREATE TRIGGER trg_set_closer_task_creator_role
  BEFORE INSERT ON public.closer_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_closer_task_creator_role();

-- Backfill: stamp existing rows with the creator's current role. Best-effort
-- (the role at creation may differ from the role today, but for the existing
-- admin-only history this is good enough).
UPDATE public.closer_tasks ct
SET created_by_role = au.role
FROM public.app_users au
WHERE au.user_id = ct.created_by
  AND ct.created_by_role IS NULL;

COMMENT ON COLUMN public.closer_tasks.created_by_role IS
  'Snapshot of app_users.role at insert time. Sales rep portal uses this to label/filter broker-originated tasks.';

NOTIFY pgrst, 'reload schema';
