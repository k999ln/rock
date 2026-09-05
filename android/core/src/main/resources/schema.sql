CREATE TABLE rock_meta (version INTEGER NOT NULL CHECK(version=1));
INSERT INTO rock_meta VALUES(1);
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id=1), paused INTEGER NOT NULL CHECK(paused IN(0,1)));
INSERT INTO settings VALUES(1,0);
CREATE TABLE works (
 id TEXT PRIMARY KEY,
 request_key TEXT NOT NULL UNIQUE,
 request_hash TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('active','review','completed','cancelled')),
 sample INTEGER NOT NULL CHECK(sample IN(0,1)),
 review_note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE artifacts (
 work_id TEXT NOT NULL REFERENCES works(id),
 digest TEXT NOT NULL,
 body TEXT NOT NULL,
 PRIMARY KEY(work_id,digest)
);
CREATE TABLE runs (
 work_id TEXT NOT NULL REFERENCES works(id),
 step INTEGER NOT NULL CHECK(step IN(0,1)),
 tool TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('pending','queued','running','succeeded','needs_review','failed','cancelled')),
 attempt INTEGER NOT NULL DEFAULT 0 CHECK(attempt>=0 AND attempt<=3),
 token TEXT,
 boot TEXT,
 deadline INTEGER,
 input_digest TEXT,
 output_digest TEXT,
 error TEXT,
 PRIMARY KEY(work_id,step),
 FOREIGN KEY(work_id,input_digest) REFERENCES artifacts(work_id,digest),
 FOREIGN KEY(work_id,output_digest) REFERENCES artifacts(work_id,digest)
);
CREATE INDEX runs_queue ON runs(state,work_id,step);
CREATE TABLE events (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 work_id TEXT NOT NULL REFERENCES works(id),
 step INTEGER NOT NULL,
 kind TEXT NOT NULL
);
