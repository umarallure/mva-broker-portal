-- Allow multiple broker-attorney retainer documents for the same state and
-- optionally attach an external setup walkthrough such as a Loom recording.
ALTER TABLE public.broker_attorney_retainer_documents
  DROP CONSTRAINT IF EXISTS broker_attorney_retainer_documents_unique_state;

ALTER TABLE public.broker_attorney_retainer_documents
  ADD COLUMN IF NOT EXISTS setup_walkthrough_url text;

UPDATE public.broker_attorney_retainer_documents
SET setup_walkthrough_url = NULL
WHERE setup_walkthrough_url IS NOT NULL
  AND btrim(setup_walkthrough_url) = '';

ALTER TABLE public.broker_attorney_retainer_documents
  DROP CONSTRAINT IF EXISTS broker_attorney_retainer_documents_walkthrough_url_check;

ALTER TABLE public.broker_attorney_retainer_documents
  ADD CONSTRAINT broker_attorney_retainer_documents_walkthrough_url_check
  CHECK (
    setup_walkthrough_url IS NULL
    OR setup_walkthrough_url ~* '^https?://'
  );

NOTIFY pgrst, 'reload schema';
