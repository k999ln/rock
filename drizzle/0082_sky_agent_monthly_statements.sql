CREATE TABLE __new_sky_linux_service_documents (
 id TEXT PRIMARY KEY NOT NULL, owner_user_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('workspace','listing','review','agent_monthly_statement')),
 period TEXT, currency TEXT, revision INTEGER NOT NULL DEFAULT 0,
 payload TEXT NOT NULL CHECK(json_valid(payload)), updated_at INTEGER NOT NULL
);
--> statement-breakpoint
INSERT INTO __new_sky_linux_service_documents(id,owner_user_id,kind,revision,payload,updated_at)
 SELECT id,owner_user_id,kind,revision,payload,updated_at FROM sky_linux_service_documents;
--> statement-breakpoint
DROP TABLE sky_linux_service_documents;
--> statement-breakpoint
ALTER TABLE __new_sky_linux_service_documents RENAME TO sky_linux_service_documents;
--> statement-breakpoint
CREATE INDEX idx_sky_linux_service_owner ON sky_linux_service_documents(owner_user_id,kind,updated_at);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_sky_agent_monthly_owner_period ON sky_linux_service_documents(owner_user_id,kind,period,currency);
--> statement-breakpoint
CREATE TRIGGER sky_agent_monthly_insert BEFORE INSERT ON sky_linux_service_documents WHEN NEW.kind='agent_monthly_statement' BEGIN
 SELECT CASE WHEN NEW.revision IS NOT 0 THEN RAISE(ABORT,'AGENT_MONTHLY_REVISION') END;
 SELECT CASE WHEN json_extract(NEW.payload,'$.schema') IS NOT 'sky.agent-monthly-statement/1' OR
  json_extract(NEW.payload,'$.id') IS NOT NEW.id OR
  json_extract(NEW.payload,'$.ownerId') IS NOT NEW.owner_user_id OR
  json_extract(NEW.payload,'$.mode') IS NOT 'test' OR
  json_extract(NEW.payload,'$.state') IS NOT 'draft_unreconciled' OR
  json_extract(NEW.payload,'$.invoice') IS NOT 'not_created' OR
  json_extract(NEW.payload,'$.collection') IS NOT 'disabled' OR
  json_extract(NEW.payload,'$.customerPayment') IS NOT 'unconfirmed' OR
  NEW.period IS NULL OR
  NEW.currency NOT IN ('USD','JPY') OR
  NEW.currency IS NULL OR
  json_extract(NEW.payload,'$.period') IS NOT NEW.period OR
  json_extract(NEW.payload,'$.currency') IS NOT NEW.currency OR
  json_extract(NEW.payload,'$.baseMinor') IS NOT 0 OR
  json_type(NEW.payload,'$.items') IS NOT 'array' OR
  json_array_length(NEW.payload,'$.items') NOT BETWEEN 1 AND 200 OR
  strftime('%Y-%m',NEW.period||'-01') IS NOT NEW.period THEN RAISE(ABORT,'AGENT_MONTHLY_SHAPE') END;
 SELECT CASE WHEN json_type(NEW.payload,'$.amountMinor') IS NOT 'integer' OR json_extract(NEW.payload,'$.amountMinor') IS NOT (SELECT sum(json_extract(value,'$.amountMinor')) FROM json_each(NEW.payload,'$.items')) OR EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.items') WHERE json_type(value,'$.amountMinor') IS NOT 'integer' OR json_extract(value,'$.amountMinor')<0) THEN RAISE(ABORT,'AGENT_MONTHLY_TOTAL') END;
 SELECT CASE WHEN json_type(NEW.payload,'$.observedMinor') IS NOT 'integer' OR json_extract(NEW.payload,'$.observedMinor') IS NOT (SELECT sum(json_extract(value,'$.observedMinor')) FROM json_each(NEW.payload,'$.items')) OR EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.items') WHERE json_type(value,'$.observedMinor') IS NOT 'integer' OR json_extract(value,'$.observedMinor')<0) THEN RAISE(ABORT,'AGENT_MONTHLY_TOTAL') END;
 SELECT CASE WHEN json_type(NEW.payload,'$.authorGrossMinor') IS NOT 'integer' OR json_extract(NEW.payload,'$.authorGrossMinor') IS NOT (SELECT sum(json_extract(value,'$.authorGrossMinor')) FROM json_each(NEW.payload,'$.items')) OR EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.items') WHERE json_type(value,'$.authorGrossMinor') IS NOT 'integer' OR json_extract(value,'$.authorGrossMinor')<0) THEN RAISE(ABORT,'AGENT_MONTHLY_TOTAL') END;
 SELECT CASE WHEN json_type(NEW.payload,'$.commissionMinor') IS NOT 'integer' OR json_extract(NEW.payload,'$.commissionMinor') IS NOT (SELECT sum(json_extract(value,'$.commissionMinor')) FROM json_each(NEW.payload,'$.items')) OR EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.items') WHERE json_type(value,'$.commissionMinor') IS NOT 'integer' OR json_extract(value,'$.commissionMinor')<0) THEN RAISE(ABORT,'AGENT_MONTHLY_TOTAL') END;
 SELECT CASE WHEN json_type(NEW.payload,'$.authorPayableMinor') IS NOT 'integer' OR json_extract(NEW.payload,'$.authorPayableMinor') IS NOT (SELECT sum(json_extract(value,'$.authorPayableMinor')) FROM json_each(NEW.payload,'$.items')) OR EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.items') WHERE json_type(value,'$.authorPayableMinor') IS NOT 'integer' OR json_extract(value,'$.authorPayableMinor')<0) THEN RAISE(ABORT,'AGENT_MONTHLY_TOTAL') END;
 SELECT CASE WHEN json_type(NEW.payload,'$.otherUsageMinor') IS NOT 'integer' OR json_extract(NEW.payload,'$.otherUsageMinor') IS NOT (SELECT sum(json_extract(value,'$.otherUsageMinor')) FROM json_each(NEW.payload,'$.items')) OR EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.items') WHERE json_type(value,'$.otherUsageMinor') IS NOT 'integer' OR json_extract(value,'$.otherUsageMinor')<0) THEN RAISE(ABORT,'AGENT_MONTHLY_TOTAL') END;
 SELECT CASE WHEN (SELECT count(DISTINCT json_extract(value,'$.paymentId')) FROM json_each(NEW.payload,'$.items')) IS NOT json_array_length(NEW.payload,'$.items') THEN RAISE(ABORT,'AGENT_MONTHLY_DUPLICATE') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.items') item WHERE NOT EXISTS(
 SELECT 1 FROM sky_usage_payments p
 JOIN a2a_usage_receipts r ON r.delegation_id=p.agent_source_id AND r.owner_user_id=p.owner_user_id
 JOIN agent_delegations d ON d.id=p.agent_source_id AND d.owner_user_id=p.owner_user_id AND d.parent_job_id=r.parent_job_id
 JOIN work_jobs w ON w.id=d.parent_job_id AND w.user_id=p.owner_user_id
 JOIN json_each(w.payload,'$.eveAgent.usageSources') s ON json_extract(s.value,'$.provenance.delegationId')=d.id
 JOIN sky_author_agreement_documents a ON a.agreement_sha256=json_extract(s.value,'$.authorAgreement.agreementSha256') AND a.revoked_at IS NULL
 JOIN sky_package_runtime_bindings b ON b.binding_id=d.package_runtime_binding_id AND b.digest=d.package_runtime_binding_digest AND b.status='active'
 WHERE p.id=json_extract(item.value,'$.paymentId') AND p.owner_user_id=NEW.owner_user_id AND p.mode='test' AND p.state='prepared' AND p.source_kind='sky_agent'
 AND p.agent_source_id=json_extract(item.value,'$.sourceId') AND p.source_digest=json_extract(item.value,'$.digest')
 AND p.confirmation_id=json_extract(item.value,'$.confirmationId') AND p.amount_minor=json_extract(item.value,'$.amountMinor') AND p.currency=lower(NEW.currency)
 AND strftime('%Y-%m',r.issued_at/1000.0,'unixepoch')=NEW.period
 AND r.amount_minor=json_extract(item.value,'$.observedMinor') AND d.parent_job_id=json_extract(item.value,'$.parentJobId')
 AND json_extract(w.payload,'$.eveAgent.threadId')=json_extract(item.value,'$.threadId')
 AND a.agreement_sha256=json_extract(item.value,'$.agreementSha256') AND a.publisher_id=json_extract(item.value,'$.publisherId')
 AND json_extract(a.agreement_json,'$.expiresAt')>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)
 AND json_extract(b.binding_json,'$.expiresAt')>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)
 AND json_extract(s.value,'$.collectionConsent.id')=p.confirmation_id
 AND json_extract(s.value,'$.provenance.receiptSha256')=json_extract(item.value,'$.receiptSha256')
 AND json_extract(s.value,'$.authorAllocation.allocation.grossMinor')=json_extract(item.value,'$.authorGrossMinor')
 AND json_extract(s.value,'$.authorAllocation.allocation.commissionMinor')=json_extract(item.value,'$.commissionMinor')
 AND json_extract(s.value,'$.authorAllocation.allocation.payableMinor')=json_extract(item.value,'$.authorPayableMinor')
 AND json_extract(s.value,'$.authorAllocation.otherUsageMinor')=json_extract(item.value,'$.otherUsageMinor')
 )) THEN RAISE(ABORT,'AGENT_MONTHLY_SOURCE') END;
END;
--> statement-breakpoint
CREATE TRIGGER sky_agent_monthly_update BEFORE UPDATE ON sky_linux_service_documents WHEN OLD.kind='agent_monthly_statement' OR NEW.kind='agent_monthly_statement' BEGIN
 SELECT CASE WHEN OLD.kind IS NOT NEW.kind OR OLD.owner_user_id IS NOT NEW.owner_user_id OR OLD.id IS NOT NEW.id OR OLD.period IS NOT NEW.period OR OLD.currency IS NOT NEW.currency OR NEW.revision IS NOT OLD.revision+1 THEN RAISE(ABORT,'AGENT_MONTHLY_IMMUTABLE') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(OLD.payload,'$.items') old_item WHERE NOT EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.items') new_item WHERE json_extract(old_item.value,'$.paymentId')=json_extract(new_item.value,'$.paymentId') AND json(old_item.value)=json(new_item.value))) THEN RAISE(ABORT,'AGENT_MONTHLY_MEMBER_IMMUTABLE') END;
 SELECT CASE WHEN json_extract(NEW.payload,'$.schema') IS NOT 'sky.agent-monthly-statement/1' OR
  json_extract(NEW.payload,'$.id') IS NOT NEW.id OR
  json_extract(NEW.payload,'$.ownerId') IS NOT NEW.owner_user_id OR
  json_extract(NEW.payload,'$.mode') IS NOT 'test' OR
  json_extract(NEW.payload,'$.state') IS NOT 'draft_unreconciled' OR
  json_extract(NEW.payload,'$.invoice') IS NOT 'not_created' OR
  json_extract(NEW.payload,'$.collection') IS NOT 'disabled' OR
  json_extract(NEW.payload,'$.customerPayment') IS NOT 'unconfirmed' OR
  NEW.period IS NULL OR
  NEW.currency NOT IN ('USD','JPY') OR
  NEW.currency IS NULL OR
  json_extract(NEW.payload,'$.period') IS NOT NEW.period OR
  json_extract(NEW.payload,'$.currency') IS NOT NEW.currency OR
  json_extract(NEW.payload,'$.baseMinor') IS NOT 0 OR
  json_type(NEW.payload,'$.items') IS NOT 'array' OR
  json_array_length(NEW.payload,'$.items') NOT BETWEEN 1 AND 200 OR
  strftime('%Y-%m',NEW.period||'-01') IS NOT NEW.period THEN RAISE(ABORT,'AGENT_MONTHLY_SHAPE') END;
 SELECT CASE WHEN json_type(NEW.payload,'$.amountMinor') IS NOT 'integer' OR json_extract(NEW.payload,'$.amountMinor') IS NOT (SELECT sum(json_extract(value,'$.amountMinor')) FROM json_each(NEW.payload,'$.items')) OR EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.items') WHERE json_type(value,'$.amountMinor') IS NOT 'integer' OR json_extract(value,'$.amountMinor')<0) THEN RAISE(ABORT,'AGENT_MONTHLY_TOTAL') END;
 SELECT CASE WHEN json_type(NEW.payload,'$.observedMinor') IS NOT 'integer' OR json_extract(NEW.payload,'$.observedMinor') IS NOT (SELECT sum(json_extract(value,'$.observedMinor')) FROM json_each(NEW.payload,'$.items')) OR EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.items') WHERE json_type(value,'$.observedMinor') IS NOT 'integer' OR json_extract(value,'$.observedMinor')<0) THEN RAISE(ABORT,'AGENT_MONTHLY_TOTAL') END;
 SELECT CASE WHEN json_type(NEW.payload,'$.authorGrossMinor') IS NOT 'integer' OR json_extract(NEW.payload,'$.authorGrossMinor') IS NOT (SELECT sum(json_extract(value,'$.authorGrossMinor')) FROM json_each(NEW.payload,'$.items')) OR EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.items') WHERE json_type(value,'$.authorGrossMinor') IS NOT 'integer' OR json_extract(value,'$.authorGrossMinor')<0) THEN RAISE(ABORT,'AGENT_MONTHLY_TOTAL') END;
 SELECT CASE WHEN json_type(NEW.payload,'$.commissionMinor') IS NOT 'integer' OR json_extract(NEW.payload,'$.commissionMinor') IS NOT (SELECT sum(json_extract(value,'$.commissionMinor')) FROM json_each(NEW.payload,'$.items')) OR EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.items') WHERE json_type(value,'$.commissionMinor') IS NOT 'integer' OR json_extract(value,'$.commissionMinor')<0) THEN RAISE(ABORT,'AGENT_MONTHLY_TOTAL') END;
 SELECT CASE WHEN json_type(NEW.payload,'$.authorPayableMinor') IS NOT 'integer' OR json_extract(NEW.payload,'$.authorPayableMinor') IS NOT (SELECT sum(json_extract(value,'$.authorPayableMinor')) FROM json_each(NEW.payload,'$.items')) OR EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.items') WHERE json_type(value,'$.authorPayableMinor') IS NOT 'integer' OR json_extract(value,'$.authorPayableMinor')<0) THEN RAISE(ABORT,'AGENT_MONTHLY_TOTAL') END;
 SELECT CASE WHEN json_type(NEW.payload,'$.otherUsageMinor') IS NOT 'integer' OR json_extract(NEW.payload,'$.otherUsageMinor') IS NOT (SELECT sum(json_extract(value,'$.otherUsageMinor')) FROM json_each(NEW.payload,'$.items')) OR EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.items') WHERE json_type(value,'$.otherUsageMinor') IS NOT 'integer' OR json_extract(value,'$.otherUsageMinor')<0) THEN RAISE(ABORT,'AGENT_MONTHLY_TOTAL') END;
 SELECT CASE WHEN (SELECT count(DISTINCT json_extract(value,'$.paymentId')) FROM json_each(NEW.payload,'$.items')) IS NOT json_array_length(NEW.payload,'$.items') THEN RAISE(ABORT,'AGENT_MONTHLY_DUPLICATE') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.payload,'$.items') item WHERE NOT EXISTS(
 SELECT 1 FROM sky_usage_payments p
 JOIN a2a_usage_receipts r ON r.delegation_id=p.agent_source_id AND r.owner_user_id=p.owner_user_id
 JOIN agent_delegations d ON d.id=p.agent_source_id AND d.owner_user_id=p.owner_user_id AND d.parent_job_id=r.parent_job_id
 JOIN work_jobs w ON w.id=d.parent_job_id AND w.user_id=p.owner_user_id
 JOIN json_each(w.payload,'$.eveAgent.usageSources') s ON json_extract(s.value,'$.provenance.delegationId')=d.id
 JOIN sky_author_agreement_documents a ON a.agreement_sha256=json_extract(s.value,'$.authorAgreement.agreementSha256') AND a.revoked_at IS NULL
 JOIN sky_package_runtime_bindings b ON b.binding_id=d.package_runtime_binding_id AND b.digest=d.package_runtime_binding_digest AND b.status='active'
 WHERE p.id=json_extract(item.value,'$.paymentId') AND p.owner_user_id=NEW.owner_user_id AND p.mode='test' AND p.state='prepared' AND p.source_kind='sky_agent'
 AND p.agent_source_id=json_extract(item.value,'$.sourceId') AND p.source_digest=json_extract(item.value,'$.digest')
 AND p.confirmation_id=json_extract(item.value,'$.confirmationId') AND p.amount_minor=json_extract(item.value,'$.amountMinor') AND p.currency=lower(NEW.currency)
 AND strftime('%Y-%m',r.issued_at/1000.0,'unixepoch')=NEW.period
 AND r.amount_minor=json_extract(item.value,'$.observedMinor') AND d.parent_job_id=json_extract(item.value,'$.parentJobId')
 AND json_extract(w.payload,'$.eveAgent.threadId')=json_extract(item.value,'$.threadId')
 AND a.agreement_sha256=json_extract(item.value,'$.agreementSha256') AND a.publisher_id=json_extract(item.value,'$.publisherId')
 AND json_extract(a.agreement_json,'$.expiresAt')>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)
 AND json_extract(b.binding_json,'$.expiresAt')>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)
 AND json_extract(s.value,'$.collectionConsent.id')=p.confirmation_id
 AND json_extract(s.value,'$.provenance.receiptSha256')=json_extract(item.value,'$.receiptSha256')
 AND json_extract(s.value,'$.authorAllocation.allocation.grossMinor')=json_extract(item.value,'$.authorGrossMinor')
 AND json_extract(s.value,'$.authorAllocation.allocation.commissionMinor')=json_extract(item.value,'$.commissionMinor')
 AND json_extract(s.value,'$.authorAllocation.allocation.payableMinor')=json_extract(item.value,'$.authorPayableMinor')
 AND json_extract(s.value,'$.authorAllocation.otherUsageMinor')=json_extract(item.value,'$.otherUsageMinor')
 )) THEN RAISE(ABORT,'AGENT_MONTHLY_SOURCE') END;
END;
--> statement-breakpoint
CREATE TRIGGER sky_agent_monthly_no_delete BEFORE DELETE ON sky_linux_service_documents WHEN OLD.kind='agent_monthly_statement' BEGIN SELECT RAISE(ABORT,'AGENT_MONTHLY_IMMUTABLE'); END;
