-- Broker notifications: sent retainers and broker invoice creation.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS invoice_id uuid NULL REFERENCES public.invoices(id) ON DELETE SET NULL;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_category_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_category_check
  CHECK (
    category::text = ANY (
      ARRAY[
        'new_lead',
        'lead_assigned',
        'stage_updated',
        'pipeline_changed',
        'note_added',
        'invoice_created'
      ]::text[]
    )
  );

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created_at
  ON public.notifications(recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications(recipient_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_lead_id
  ON public.notifications(lead_id)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_invoice_id
  ON public.notifications(invoice_id)
  WHERE invoice_id IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select ON public.notifications;
DROP POLICY IF EXISTS notifications_update_read ON public.notifications;
DROP POLICY IF EXISTS notifications_delete ON public.notifications;
DROP POLICY IF EXISTS notifications_recipient_select ON public.notifications;
DROP POLICY IF EXISTS notifications_recipient_update_read ON public.notifications;
DROP POLICY IF EXISTS notifications_recipient_delete ON public.notifications;

CREATE POLICY notifications_select
  ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY notifications_update_read
  ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (
    recipient_id = auth.uid()
    AND is_read = true
  );

CREATE POLICY notifications_delete
  ON public.notifications FOR DELETE TO authenticated
  USING (recipient_id = auth.uid());

CREATE OR REPLACE FUNCTION public.broker_notification_recipient_ids(
  p_broker_id uuid,
  p_section text
)
RETURNS TABLE (recipient_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_broker_id
  WHERE p_broker_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.app_users au
      WHERE au.user_id = p_broker_id
        AND au.role = 'broker'
        AND (au.account_status IS NULL OR lower(au.account_status) NOT IN ('disabled', 'inactive', 'suspended'))
    )

  UNION

  SELECT btm.user_id
  FROM public.broker_team_members btm
  JOIN public.app_users au ON au.user_id = btm.user_id
  WHERE btm.broker_id = p_broker_id
    AND p_section = ANY (coalesce(btm.allowed_sections, ARRAY[]::text[]))
    AND (au.account_status IS NULL OR lower(au.account_status) NOT IN ('disabled', 'inactive', 'suspended'))
$$;

REVOKE ALL ON FUNCTION public.broker_notification_recipient_ids(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.broker_notification_recipient_ids(uuid, text) FROM authenticated;

CREATE OR REPLACE FUNCTION public.notify_broker_sent_retainer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_broker_id uuid;
  v_lead_name text;
  v_recipient record;
BEGIN
  IF NEW.assigned_broker_attorney_id IS NULL
    OR NEW.status IS DISTINCT FROM 'attorney_review'
    OR (
      TG_OP = 'UPDATE'
      AND OLD.assigned_broker_attorney_id IS NOT DISTINCT FROM NEW.assigned_broker_attorney_id
      AND OLD.status IS NOT DISTINCT FROM NEW.status
    )
  THEN
    RETURN NEW;
  END IF;

  SELECT ba.broker_id
  INTO v_broker_id
  FROM public.broker_attorneys ba
  WHERE ba.id = NEW.assigned_broker_attorney_id
  LIMIT 1;

  IF v_broker_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_lead_name := nullif(btrim(coalesce(NEW.customer_full_name, NEW.submission_id, '')), '');

  FOR v_recipient IN
    SELECT recipient_id FROM public.broker_notification_recipient_ids(v_broker_id, 'cases')
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.recipient_id = v_recipient.recipient_id
        AND n.category = 'new_lead'
        AND n.lead_id = NEW.id
    ) THEN
      INSERT INTO public.notifications (
        recipient_id,
        actor_id,
        category,
        title,
        description,
        redirect_url,
        lead_id,
        lead_name
      )
      VALUES (
        v_recipient.recipient_id,
        auth.uid(),
        'new_lead',
        'New retainer sent',
        'A new retainer for ' || coalesce(v_lead_name, 'Unknown Client') || ' is ready in My Cases.',
        '/retainers/' || NEW.id,
        NEW.id,
        v_lead_name
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_broker_invoice_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient record;
BEGIN
  IF NEW.invoice_type IS DISTINCT FROM 'broker' OR NEW.broker_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_recipient IN
    SELECT recipient_id FROM public.broker_notification_recipient_ids(NEW.broker_id, 'invoicing')
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.recipient_id = v_recipient.recipient_id
        AND n.category = 'invoice_created'
        AND n.invoice_id = NEW.id
    ) THEN
      INSERT INTO public.notifications (
        recipient_id,
        actor_id,
        category,
        title,
        description,
        redirect_url,
        invoice_id
      )
      VALUES (
        v_recipient.recipient_id,
        NEW.created_by,
        'invoice_created',
        'Broker invoice created',
        'Invoice ' || NEW.invoice_number || ' for $' || to_char(coalesce(NEW.total_amount, 0), 'FM999,999,999,990.00') || ' is ready for review.',
        '/invoicing/broker?invoice_id=' || NEW.id,
        NEW.id
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_broker_sent_retainer ON public.leads;

CREATE TRIGGER trg_notify_broker_sent_retainer
  AFTER INSERT OR UPDATE OF assigned_broker_attorney_id, status
  ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_broker_sent_retainer();

DROP TRIGGER IF EXISTS trg_notify_broker_invoice_created ON public.invoices;

CREATE TRIGGER trg_notify_broker_invoice_created
  AFTER INSERT
  ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_broker_invoice_created();

NOTIFY pgrst, 'reload schema';
