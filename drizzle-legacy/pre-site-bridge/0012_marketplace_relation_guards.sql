-- Preserve the published table layout while enforcing the logical relations
-- used by the PAPER marketplace. These guards apply to new writes and do not
-- delete or rewrite existing records.
CREATE TRIGGER marketplace_approvals_relation_guard
BEFORE INSERT ON marketplace_approvals
WHEN NOT EXISTS (
	SELECT 1 FROM marketplace_proposals AS proposal
	WHERE proposal.id = NEW.proposal_id
		AND proposal.user_id = NEW.user_id
		AND proposal.proposal_digest = NEW.proposal_digest
		AND proposal.status = 'PROPOSED'
)
BEGIN SELECT RAISE(ABORT, 'marketplace approval relation mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_reservations_relation_guard
BEFORE INSERT ON marketplace_reservations
WHEN NOT EXISTS (
	SELECT 1 FROM marketplace_proposals AS proposal
	WHERE proposal.id = NEW.proposal_id
		AND proposal.user_id = NEW.user_id
		AND proposal.notional_minor = NEW.held_minor
		AND proposal.status = 'EXECUTED'
)
	OR NEW.state != 'COMMITTED'
BEGIN SELECT RAISE(ABORT, 'marketplace reservation relation mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_receipts_relation_guard
BEFORE INSERT ON marketplace_receipts
WHEN NOT EXISTS (
	SELECT 1 FROM marketplace_proposals AS proposal
	WHERE proposal.id = NEW.proposal_id
		AND proposal.user_id = NEW.user_id
		AND proposal.status = 'EXECUTED'
)
BEGIN SELECT RAISE(ABORT, 'marketplace receipt relation mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_positions_relation_guard
BEFORE INSERT ON marketplace_positions
WHEN NOT EXISTS (
	SELECT 1 FROM marketplace_proposals AS proposal
	WHERE proposal.id = NEW.proposal_id
		AND proposal.user_id = NEW.user_id
		AND proposal.asset_id = NEW.asset_id
		AND proposal.side = NEW.side
		AND proposal.quantity = NEW.quantity
		AND proposal.price_minor = NEW.entry_price_minor
		AND proposal.notional_minor = NEW.notional_minor
		AND proposal.status = 'EXECUTED'
)
BEGIN SELECT RAISE(ABORT, 'marketplace position relation mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_reservation_binding_frozen
BEFORE UPDATE OF proposal_id,user_id,held_minor ON marketplace_reservations
BEGIN SELECT RAISE(ABORT, 'marketplace reservation binding immutable'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_position_binding_frozen
BEFORE UPDATE OF proposal_id,user_id,asset_id,side,quantity,entry_price_minor,notional_minor
ON marketplace_positions
BEGIN SELECT RAISE(ABORT, 'marketplace position binding immutable'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_reservations_no_delete
BEFORE DELETE ON marketplace_reservations
BEGIN SELECT RAISE(ABORT, 'marketplace reservation immutable'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_positions_no_delete
BEFORE DELETE ON marketplace_positions
BEGIN SELECT RAISE(ABORT, 'marketplace position immutable'); END;
