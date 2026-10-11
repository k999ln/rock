"""Failover policy uses a monotonic clock, independently of message UTC expiry."""
from dataclasses import dataclass
import random
from concurrent.futures import ThreadPoolExecutor
from .transport import AuthenticationError, HardDown, LinkError

@dataclass
class Route:
    name: str
    priority: int
    link: object
    allowed: bool = False
    interval: float = 5.0
    is_satellite: bool = False
    next_probe: float = 0.0
    healthy_since: float | None = None
    failures: int = 0
    healthy: bool = False
    last_error: str | None = None

class Selector:
    def __init__(self, routes, *, stable_seconds=30, dwell_seconds=60, rng=None):
        self.routes = {r.name:r for r in routes}
        if len(self.routes) != len(routes):
            raise ValueError("route names must be unique")
        self.stable, self.dwell = stable_seconds, dwell_seconds
        self.current = None
        self.selected_at = 0.0
        self.rng = rng or random.Random()

    def refresh(self, now):
        due = [r for r in self.routes.values() if r.allowed and now >= r.next_probe]
        # A broken/slow Wi-Fi probe does not stop independent cellular probing.
        def attempt(r):
            try:
                r.link.probe()
                return r, None
            except (LinkError, ValueError) as exc:
                return r, exc
        if due:
            with ThreadPoolExecutor(max_workers=len(due)) as executor:
                results = list(executor.map(attempt, due))
            for r, error in results:
                if error is None:
                    r.healthy = True
                    if r.healthy_since is None:
                        r.healthy_since = now
                    r.failures, r.last_error = 0, None
                    r.next_probe = now + r.interval
                else:
                    self.failed(r.name, now, error)
        return self.select(now)

    def failed(self, name, now, error, *, actual_transfer=False):
        r = self.routes[name]
        r.failures += 1
        r.last_error = type(error).__name__
        r.healthy_since = None
        if actual_transfer or isinstance(error, (HardDown, AuthenticationError)) or r.failures >= 3:
            r.healthy = False
        # Satellite retry interval is supplied by the selected service, never 5 s by default.
        delay = r.interval if r.is_satellite else min(60, 5 * 2 ** min(r.failures - 1, 4))
        r.next_probe = now + (delay if r.is_satellite else delay * self.rng.uniform(.8, 1.2))

    def select(self, now):
        available = sorted((r for r in self.routes.values() if r.allowed and r.healthy), key=lambda r:r.priority)
        previous = self.routes.get(self.current)
        if not available:
            self.current = None
            return None
        best = available[0]
        if previous and previous in available:
            if best.priority >= previous.priority:
                return previous
            if best.healthy_since is None or now-best.healthy_since < self.stable or now-self.selected_at < self.dwell:
                return previous
        if best.name != self.current:
            self.selected_at = now
            self.current = best.name
        return best
