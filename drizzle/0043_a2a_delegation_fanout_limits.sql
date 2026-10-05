-- RockstarOS currently supports a single owner-authorized A2A delegation
-- layer per root work job. Keep bounded fan-out and concurrency at the D1
-- boundary so parallel clients cannot race around application checks.
CREATE TRIGGER `a2a_delegation_fanout_limits_before_insert`
BEFORE INSERT ON `agent_delegations`
WHEN NOT EXISTS (
  SELECT 1 FROM `agent_delegations` d
  WHERE d.`owner_user_id` = NEW.`owner_user_id`
    AND d.`idempotency_key` = NEW.`idempotency_key`
)
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM `agent_delegations` d
    WHERE d.`owner_user_id` = NEW.`owner_user_id`
      AND d.`parent_job_id` = NEW.`parent_job_id`
      AND d.`state` IN (
        'awaiting_approval', 'prepared', 'dispatching', 'dispatch_submitting',
        'indeterminate', 'submitted', 'working', 'awaiting_remote_input',
        'cancel_requested', 'cancel_submitting', 'cancel_unconfirmed'
      )
  ) >= 4 THEN RAISE(ABORT, 'A2A_DELEGATION_CONCURRENCY_LIMIT') END;
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM `agent_delegations` d
    WHERE d.`owner_user_id` = NEW.`owner_user_id`
      AND d.`parent_job_id` = NEW.`parent_job_id`
  ) >= 8 THEN RAISE(ABORT, 'A2A_DELEGATION_COUNT_LIMIT') END;
END;
