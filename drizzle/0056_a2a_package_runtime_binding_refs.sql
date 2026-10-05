ALTER TABLE `agent_delegations` ADD COLUMN `package_runtime_binding_id` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `agent_delegations` ADD COLUMN `package_runtime_binding_digest` text NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE INDEX `idx_agent_delegation_package_binding` ON `agent_delegations` (`package_runtime_binding_id`,`package_runtime_binding_digest`);
