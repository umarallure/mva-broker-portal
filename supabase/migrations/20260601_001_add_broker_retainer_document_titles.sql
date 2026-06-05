-- Give broker-attorney retainer documents a broker-defined display title.
ALTER TABLE public.broker_attorney_retainer_documents
  ADD COLUMN IF NOT EXISTS document_title text;

UPDATE public.broker_attorney_retainer_documents
SET document_title = document_name
WHERE document_title IS NULL
  OR btrim(document_title) = '';

ALTER TABLE public.broker_attorney_retainer_documents
  ALTER COLUMN document_title SET NOT NULL;

ALTER TABLE public.broker_attorney_retainer_documents
  DROP CONSTRAINT IF EXISTS broker_attorney_retainer_documents_title_check;

ALTER TABLE public.broker_attorney_retainer_documents
  ADD CONSTRAINT broker_attorney_retainer_documents_title_check
  CHECK (btrim(document_title) <> '');

NOTIFY pgrst, 'reload schema';
