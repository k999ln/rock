ALTER TABLE noah_agent_invites ADD COLUMN execution_allowed INTEGER NOT NULL DEFAULT 0 CHECK(execution_allowed IN (0,1) AND (execution_allowed=0 OR access_scope='source'));
