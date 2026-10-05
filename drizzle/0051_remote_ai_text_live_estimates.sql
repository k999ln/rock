DROP TRIGGER remote_ai_text_state_guard;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_state_guard BEFORE UPDATE ON remote_ai_text_executions
BEGIN
  SELECT CASE WHEN NEW.revision != OLD.revision + 1 OR NEW.updated_at < OLD.updated_at
    OR NOT (
      (OLD.state = 'quoted' AND NEW.state IN ('reserved','cancelled','expired')) OR
      (OLD.state = 'reserved' AND NEW.state IN ('sending','cancelled','expired')) OR
      (OLD.state = 'sending' AND NEW.state IN ('completed','unreconciled')) OR
      (OLD.state = 'sending' AND NEW.state = 'sending'
        AND NEW.settled_minor IS OLD.settled_minor AND NEW.usage_json IS OLD.usage_json
        AND NEW.price_json IS OLD.price_json AND NEW.provider_response_id IS OLD.provider_response_id
        AND NEW.result_text IS OLD.result_text AND NEW.duration_ms IS OLD.duration_ms
        AND NEW.error_code IS OLD.error_code AND json_valid(NEW.observation_json)
        AND json_remove(NEW.observation_json, '$.liveMeter') IS
          COALESCE(json_remove(OLD.observation_json, '$.liveMeter'), '{}')
        AND json_type(NEW.observation_json, '$.liveMeter') IS 'object'
        AND json_type(NEW.observation_json, '$.liveMeter.estimatedChargeMinor') IS 'integer'
        AND json_extract(NEW.observation_json, '$.liveMeter.estimatedChargeMinor') >= 0
        AND json_extract(NEW.observation_json, '$.liveMeter.estimatedChargeMinor') <= OLD.maximum_charge_minor
        AND json_type(NEW.observation_json, '$.liveMeter.estimatedInputTokens') IS 'integer'
        AND json_extract(NEW.observation_json, '$.liveMeter.estimatedInputTokens') =
          json_extract(OLD.quote_json, '$.ceiling.inputTokenUpperBound')
        AND json_type(NEW.observation_json, '$.liveMeter.estimatedOutputTokens') IS 'integer'
        AND json_extract(NEW.observation_json, '$.liveMeter.estimatedOutputTokens') BETWEEN 0 AND
          json_extract(OLD.quote_json, '$.ceiling.outputTokenLimit')
        AND json_type(NEW.observation_json, '$.liveMeter.observedOutputBytes') IS 'integer'
        AND json_extract(NEW.observation_json, '$.liveMeter.observedOutputBytes') BETWEEN 0 AND 1500000
        AND json_type(NEW.observation_json, '$.liveMeter.observedAt') IS 'integer'
        AND json_extract(NEW.observation_json, '$.liveMeter.observedAt') >= OLD.updated_at
        AND json_extract(NEW.observation_json, '$.liveMeter.currency') IS OLD.currency
        AND json_extract(NEW.observation_json, '$.liveMeter.basis') IS
          'quoted_input_upper_bound_plus_output_utf8_bytes_divided_by_3'
        AND json_extract(NEW.observation_json, '$.liveMeter.finalProviderUsage') IS 0
        AND json_extract(NEW.observation_json, '$.liveMeter.observedOutputBytes') >
          COALESCE(json_extract(OLD.observation_json, '$.liveMeter.observedOutputBytes'), -1)
        AND json_extract(NEW.observation_json, '$.liveMeter.estimatedChargeMinor') >=
          COALESCE(json_extract(OLD.observation_json, '$.liveMeter.estimatedChargeMinor'), 0)
        AND json_extract(NEW.observation_json, '$.liveMeter.observedAt') >=
          COALESCE(json_extract(OLD.observation_json, '$.liveMeter.observedAt'), OLD.updated_at)) OR
      (OLD.state = 'unreconciled' AND NEW.state = 'completed') OR
      (OLD.state = 'completed' AND NEW.state = 'completed'
        AND OLD.result_text IS NOT NULL AND NEW.result_text IS NULL
        AND NEW.settled_minor IS OLD.settled_minor AND NEW.usage_json IS OLD.usage_json
        AND NEW.price_json IS OLD.price_json AND NEW.provider_response_id IS OLD.provider_response_id
        AND NEW.observation_json IS OLD.observation_json
        AND NEW.duration_ms IS OLD.duration_ms AND NEW.error_code IS OLD.error_code)
    ) THEN RAISE(ABORT, 'REMOTE_AI_TEXT_STATE_TRANSITION') END;
  SELECT CASE WHEN NEW.state NOT IN ('completed')
    AND (NEW.settled_minor IS NOT NULL OR NEW.provider_response_id IS NOT NULL
      OR NEW.usage_json IS NOT NULL OR NEW.price_json IS NOT NULL OR NEW.result_text IS NOT NULL)
    THEN RAISE(ABORT, 'REMOTE_AI_TEXT_UNCONFIRMED_COST') END;
END;
