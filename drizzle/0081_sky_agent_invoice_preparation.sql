CREATE TABLE `__new_sky_usage_payments` (
 id text PRIMARY KEY NOT NULL,
 owner_user_id text NOT NULL,
 source_id text REFERENCES remote_ai_text_executions(id),
 source_kind text NOT NULL DEFAULT 'cloud_llm',
 agent_source_id text REFERENCES agent_delegations(id),
 confirmation_id text,
 source_digest text NOT NULL,
 amount_minor integer NOT NULL,
 currency text NOT NULL,
 mode text NOT NULL,
 state text NOT NULL DEFAULT 'pending',
 session_id text,
 payment_intent_id text,
 refunded_minor integer NOT NULL DEFAULT 0,
 created_at integer NOT NULL,
 updated_at integer NOT NULL,
 CHECK(mode IN ('test','live')),
 CHECK(currency IN ('jpy','usd') AND amount_minor BETWEEN 1 AND 99999999),
 CHECK(refunded_minor BETWEEN 0 AND amount_minor),
 CHECK((source_kind='cloud_llm' AND source_id IS NOT NULL AND agent_source_id IS NULL AND confirmation_id IS NULL
   AND amount_minor>=50 AND state IN ('pending','paid','expired','refunded','partially_refunded','disputed'))
  OR (source_kind='sky_agent' AND source_id IS NULL AND agent_source_id IS NOT NULL
   AND confirmation_id IS NOT NULL AND length(confirmation_id)=64 AND mode='test' AND state='prepared'
   AND session_id IS NULL AND payment_intent_id IS NULL AND refunded_minor=0))
);
--> statement-breakpoint
INSERT INTO __new_sky_usage_payments
 (id,owner_user_id,source_id,source_digest,amount_minor,currency,mode,state,session_id,payment_intent_id,refunded_minor,created_at,updated_at)
 SELECT id,owner_user_id,source_id,source_digest,amount_minor,currency,mode,state,session_id,payment_intent_id,refunded_minor,created_at,updated_at FROM sky_usage_payments;
--> statement-breakpoint
DROP TABLE sky_usage_payments;
--> statement-breakpoint
ALTER TABLE __new_sky_usage_payments RENAME TO sky_usage_payments;
--> statement-breakpoint
CREATE UNIQUE INDEX idx_sky_usage_source_mode ON sky_usage_payments(source_id,mode);
CREATE UNIQUE INDEX idx_sky_usage_agent_mode ON sky_usage_payments(agent_source_id,mode);
CREATE UNIQUE INDEX idx_sky_usage_session ON sky_usage_payments(session_id);
CREATE UNIQUE INDEX idx_sky_usage_intent ON sky_usage_payments(payment_intent_id);
CREATE INDEX idx_sky_usage_owner ON sky_usage_payments(owner_user_id,created_at);
--> statement-breakpoint
CREATE TRIGGER sky_usage_payment_source BEFORE INSERT ON sky_usage_payments
WHEN NEW.source_kind='cloud_llm'
BEGIN
 SELECT CASE WHEN NEW.state!='pending' OR NEW.session_id IS NOT NULL OR NEW.payment_intent_id IS NOT NULL
  OR NEW.refunded_minor!=0 OR NOT EXISTS(SELECT 1 FROM remote_ai_text_executions e
   WHERE e.id=NEW.source_id AND e.owner_user_id=NEW.owner_user_id AND e.state='completed'
    AND e.settled_minor=NEW.amount_minor AND lower(e.currency)=NEW.currency
    AND e.settled_minor<=e.approved_cap_minor AND e.provider_response_id IS NOT NULL)
  THEN RAISE(ABORT,'USAGE_PAYMENT_SOURCE_MISMATCH') END;
END;
--> statement-breakpoint
CREATE TRIGGER sky_usage_agent_payment_source BEFORE INSERT ON sky_usage_payments
WHEN NEW.source_kind='sky_agent'
BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM agent_delegations d
  JOIN a2a_usage_receipts r ON r.delegation_id=d.id AND r.owner_user_id=d.owner_user_id AND r.parent_job_id=d.parent_job_id
  JOIN work_jobs w ON w.id=d.parent_job_id AND w.user_id=d.owner_user_id
  JOIN json_each(w.payload,'$.eveAgent.usageSources') s ON json_extract(s.value,'$.provenance.delegationId')=d.id
  JOIN sky_package_runtime_bindings b ON b.binding_id=d.package_runtime_binding_id AND b.digest=d.package_runtime_binding_digest AND b.status='active'
  JOIN sky_author_agreement_documents a ON a.agreement_sha256=json_extract(s.value,'$.authorAgreement.agreementSha256')
   AND a.platform_id=json_extract(s.value,'$.authorAgreement.agreement.platformId')
   AND a.publisher_id=json_extract(s.value,'$.authorAgreement.agreement.publisherId')
   AND a.agreement_id=json_extract(s.value,'$.authorAgreement.agreement.id')
   AND a.version=json_extract(s.value,'$.authorAgreement.agreement.version') AND a.revoked_at IS NULL
  WHERE d.id=NEW.agent_source_id AND d.owner_user_id=NEW.owner_user_id AND d.state='remote_completed'
   AND r.amount_minor<=d.budget_limit_minor AND lower(r.currency)=NEW.currency
   AND json_extract(s.value,'$.collectionConsent.schema')='sky.agent-collection-consent/1'
   AND json_extract(s.value,'$.collectionConsent.status')='recorded_pending_invoice_reconciliation'
   AND json_extract(s.value,'$.collectionConsent.id')=NEW.confirmation_id
   AND json_extract(s.value,'$.collectionConsent.ownerId')=NEW.owner_user_id
   AND json_extract(s.value,'$.collectionConsent.sourceId')=d.id
   AND json_extract(s.value,'$.collectionConsent.statementDigest')=NEW.source_digest
   AND json_extract(s.value,'$.collectionConsent.amountMinor')=NEW.amount_minor
   AND lower(json_extract(s.value,'$.collectionConsent.currency'))=NEW.currency
   AND json_extract(s.value,'$.collectionConsent.allocationCandidateId')=json_extract(s.value,'$.authorAllocation.id')
   AND json_extract(s.value,'$.collectionConsent.agreementSha256')=a.agreement_sha256
   AND json_extract(s.value,'$.collectionConsent.receiptSha256')=json_extract(s.value,'$.provenance.receiptSha256')
   AND json_extract(s.value,'$.authorAllocation.receiptSha256')=json_extract(s.value,'$.provenance.receiptSha256')
   AND json_extract(s.value,'$.authorAllocation.agreementSha256')=a.agreement_sha256
   AND json_extract(CASE WHEN json_valid(a.terms_text) THEN a.terms_text ELSE '{}' END,'$.schema')='sky.author-remuneration-terms/2'
   AND json_extract(CASE WHEN json_valid(a.terms_text) THEN a.terms_text ELSE '{}' END,'$.collection.mode')='platform_invoice'
   AND ((json_extract(CASE WHEN json_valid(a.terms_text) THEN a.terms_text ELSE '{}' END,'$.collection.chargeScope')='author_fee'
      AND json_extract(s.value,'$.authorAllocation.allocation.grossMinor')=NEW.amount_minor)
    OR (json_extract(CASE WHEN json_valid(a.terms_text) THEN a.terms_text ELSE '{}' END,'$.collection.chargeScope')='receipt_total'
      AND json_extract(CASE WHEN json_valid(a.terms_text) THEN a.terms_text ELSE '{}' END,'$.collection.usageFunding')='platform' AND r.amount_minor=NEW.amount_minor))
 ) THEN RAISE(ABORT,'AGENT_PAYMENT_SOURCE_MISMATCH') END;
END;
--> statement-breakpoint
CREATE TRIGGER sky_usage_payment_immutable BEFORE UPDATE ON sky_usage_payments
BEGIN
 SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.owner_user_id IS NOT OLD.owner_user_id
  OR NEW.source_id IS NOT OLD.source_id OR NEW.source_kind IS NOT OLD.source_kind
  OR NEW.agent_source_id IS NOT OLD.agent_source_id OR NEW.confirmation_id IS NOT OLD.confirmation_id
  OR NEW.source_digest IS NOT OLD.source_digest OR NEW.amount_minor IS NOT OLD.amount_minor OR NEW.currency IS NOT OLD.currency
  OR NEW.mode IS NOT OLD.mode OR NEW.created_at IS NOT OLD.created_at
  OR (OLD.session_id IS NOT NULL AND NEW.session_id IS NOT OLD.session_id)
  OR (OLD.payment_intent_id IS NOT NULL AND NEW.payment_intent_id IS NOT OLD.payment_intent_id)
  OR NEW.refunded_minor<OLD.refunded_minor
  THEN RAISE(ABORT,'USAGE_PAYMENT_IMMUTABLE') END;
END;
--> statement-breakpoint
CREATE TRIGGER sky_usage_payment_no_delete BEFORE DELETE ON sky_usage_payments
BEGIN SELECT RAISE(ABORT,'USAGE_PAYMENT_IMMUTABLE'); END;
