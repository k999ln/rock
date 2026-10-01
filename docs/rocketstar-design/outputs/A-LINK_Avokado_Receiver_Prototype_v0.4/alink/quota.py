"""Restart-durable conservative attempt cap, not carrier billing metering."""
import sqlite3
from .transport import HardDown

class AttemptBudget:
    def __init__(self, path, epoch):
        self.path, self.epoch = str(path), str(epoch)
        with sqlite3.connect(self.path) as db:
            db.execute("CREATE TABLE IF NOT EXISTS attempts(epoch TEXT, route TEXT, used INTEGER NOT NULL, PRIMARY KEY(epoch, route))")

    def claim(self, route, limit):
        if type(limit) is not int or limit < 0:
            raise ValueError("explicit non-negative attempt limit required")
        with sqlite3.connect(self.path, timeout=5) as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("INSERT OR IGNORE INTO attempts VALUES(?,?,0)", (self.epoch,route))
            used = db.execute("SELECT used FROM attempts WHERE epoch=? AND route=?",(self.epoch,route)).fetchone()[0]
            if used >= limit:
                raise HardDown("configured attempt cap reached")
            db.execute("UPDATE attempts SET used=used+1 WHERE epoch=? AND route=?", (self.epoch,route))
        # Never refund uncertain calls. Restart cannot silently reset this limit.

    def used(self, route):
        with sqlite3.connect(self.path) as db:
            row=db.execute("SELECT used FROM attempts WHERE epoch=? AND route=?",(self.epoch,route)).fetchone()
            return row[0] if row else 0

class BudgetedLink:
    def __init__(self, link, budget, limit):
        self.link, self.budget, self.limit = link, budget, limit
        self.name = link.name

    def _call(self, method, *args):
        self.budget.claim(self.name, self.limit)
        return getattr(self.link,method)(*args)

    def probe(self): return self._call("probe")
    def receive(self): return self._call("receive")
    def acknowledge(self, receipts): return self._call("acknowledge",receipts)
