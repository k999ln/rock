CREATE TABLE sky_author_agreement_documents (
  platform_id TEXT NOT NULL,
  publisher_id TEXT NOT NULL,
  agreement_id TEXT NOT NULL,
  version TEXT NOT NULL,
  agreement_sha256 TEXT NOT NULL CHECK(length(agreement_sha256)=64),
  terms_sha256 TEXT NOT NULL CHECK(length(terms_sha256)=64),
  agreement_json TEXT NOT NULL CHECK(json_valid(agreement_json)),
  terms_text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  revoked_by TEXT,
  PRIMARY KEY(platform_id,publisher_id,agreement_id,version),
  CHECK((revoked_at IS NULL AND revoked_by IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL))
);
--> statement-breakpoint
CREATE TRIGGER sky_author_agreement_document_immutable_update
BEFORE UPDATE ON sky_author_agreement_documents
WHEN OLD.platform_id IS NOT NEW.platform_id OR OLD.publisher_id IS NOT NEW.publisher_id
 OR OLD.agreement_id IS NOT NEW.agreement_id OR OLD.version IS NOT NEW.version
 OR OLD.agreement_sha256 IS NOT NEW.agreement_sha256 OR OLD.terms_sha256 IS NOT NEW.terms_sha256
 OR OLD.agreement_json IS NOT NEW.agreement_json OR OLD.terms_text IS NOT NEW.terms_text
 OR OLD.created_at IS NOT NEW.created_at OR OLD.revoked_at IS NOT NULL
 OR NEW.revoked_at IS NULL OR NEW.revoked_by NOT IN (OLD.platform_id,OLD.publisher_id)
BEGIN SELECT RAISE(ABORT,'AUTHOR_AGREEMENT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER sky_author_agreement_document_immutable_delete
BEFORE DELETE ON sky_author_agreement_documents
BEGIN SELECT RAISE(ABORT,'AUTHOR_AGREEMENT_IMMUTABLE'); END;
