"""Application receiver. Notifications are data; never execute their contents."""
from .transport import LinkError
from .protocol import ProtocolError

class Receiver:
    def __init__(self, store, selector):
        self.store, self.selector = store, selector
        self.status = "接続待ち"
        self.last_received = self.store.last_received_at()

    def tick(self, mono_now, utc_now):
        self.store.prune(utc_now)
        self.last_received = self.store.last_received_at()
        route = self.selector.refresh(mono_now)
        events = []
        # Try each eligible route once on a hard transfer failure in this tick.
        tried = set()
        while route and route.name not in tried:
            tried.add(route.name)
            try:
                for record in route.link.receive():
                    outcome = self.store.ingest(record, now=utc_now, source=route.name)
                    events.append({"id":record["id"], "result":outcome, "route":route.name})
                    if outcome == "stored":
                        self.last_received = utc_now
                self.status = f"{route.name}で接続中"
                receipts = self.store.pending_acks()
                if receipts:
                    confirmed = route.link.acknowledge(receipts)
                    self.store.acknowledge(confirmed)
                return {"state":self.status,"route":route.name,"events":events,
                        "pending_acks":len(self.store.pending_acks()),"last_received":self.last_received}
            except (LinkError, ProtocolError) as exc:
                self.selector.failed(route.name, mono_now, exc, actual_transfer=True)
                self.status = "接続を切り替えています"
                route = self.selector.select(mono_now)
            except (ValueError, OverflowError) as exc:
                # Storage full or invalid/contradictory record: do not ACK it or call it received.
                self.status = "受信を保留・確認が必要"
                return {"state":self.status,"route":route.name,"events":events,"error":type(exc).__name__,
                        "pending_acks":len(self.store.pending_acks()),"last_received":self.last_received}
        self.status = "接続待ち"
        return {"state":self.status,"route":None,"events":events,
                "pending_acks":len(self.store.pending_acks()),"last_received":self.last_received}
