-- Allow broker-attorney retainer documents to apply globally across all states.
ALTER TABLE public.broker_attorney_retainer_documents
  DROP CONSTRAINT IF EXISTS broker_attorney_retainer_documents_state_check;

ALTER TABLE public.broker_attorney_retainer_documents
  ADD CONSTRAINT broker_attorney_retainer_documents_state_check
  CHECK (state = 'ALL' OR state ~ '^[A-Z]{2}$');
