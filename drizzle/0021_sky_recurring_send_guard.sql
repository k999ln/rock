-- remote_ai_text_send_claims is restored by 0020 on databases where the
-- earlier mutable bridge was already recorded before this table was added.
CREATE TRIGGER IF NOT EXISTS sky_recurring_llm_send BEFORE INSERT ON remote_ai_text_send_claims WHEN (1) AND EXISTS(SELECT 1 FROM sky_recurring_contracts WHERE owner_id=NEW.owner_user_id) BEGIN
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sky_recurring_contracts c WHERE c.owner_id=NEW.owner_user_id AND c.status='active' AND c.access_until>NEW.claimed_at AND c.period_start<=NEW.claimed_at AND c.period_end>NEW.claimed_at) THEN RAISE(ABORT,'SKY_RECURRING_ACCESS_BLOCKED') END;
END;
