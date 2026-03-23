ALTER TABLE public.attorney_profiles
  ADD COLUMN IF NOT EXISTS order_limit integer NOT NULL DEFAULT 5;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ap_order_limit_min'
  ) THEN
    ALTER TABLE public.attorney_profiles
      ADD CONSTRAINT ap_order_limit_min CHECK (order_limit >= 1);
  END IF;
END $$;
