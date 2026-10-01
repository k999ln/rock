CREATE TABLE rock_wallet_operators (
  provider_id TEXT PRIMARY KEY CHECK(provider_id='org.rockstar.settlement-wallet'),
  user_id TEXT UNIQUE NOT NULL,
  address TEXT NOT NULL,
  chain_id INTEGER NOT NULL CHECK(chain_id=8453),
  network TEXT NOT NULL CHECK(network='base'),
  asset_symbol TEXT NOT NULL CHECK(asset_symbol='USDC'),
  asset_contract TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','revoked')),
  consent_version TEXT NOT NULL,
  verified_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE rock_wallet_challenges (
  challenge_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  address TEXT NOT NULL,
  chain_id INTEGER NOT NULL CHECK(chain_id=8453),
  message TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_rock_wallet_challenge_user_expiry
  ON rock_wallet_challenges(user_id, expires_at DESC);

CREATE TABLE rock_fee_collection_instructions (
  instruction_id TEXT PRIMARY KEY,
  receipt_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK(amount_minor>=0 AND amount_minor<=888),
  currency TEXT NOT NULL CHECK(currency='usd'),
  network TEXT NOT NULL CHECK(network='base'),
  chain_id INTEGER NOT NULL CHECK(chain_id=8453),
  asset_symbol TEXT NOT NULL CHECK(asset_symbol='USDC'),
  asset_contract TEXT NOT NULL,
  recipient_address TEXT,
  status TEXT NOT NULL CHECK(status IN ('not_required','awaiting_wallet','ready','confirming','collected','unknown')),
  idempotency_key TEXT UNIQUE NOT NULL,
  transaction_hash TEXT UNIQUE,
  block_number INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  verified_at INTEGER,
  FOREIGN KEY(receipt_id) REFERENCES earning_receipts(receipt_id)
);
CREATE INDEX idx_rock_fee_collection_status_created
  ON rock_fee_collection_instructions(status, created_at);
CREATE INDEX idx_rock_fee_collection_user_created
  ON rock_fee_collection_instructions(user_id, created_at DESC);
