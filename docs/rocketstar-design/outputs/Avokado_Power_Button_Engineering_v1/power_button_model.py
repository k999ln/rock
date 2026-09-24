"""Deterministic behavioral model only. No GPIO, ACPI, power driver or device I/O.
Input edges are AFTER the proposed hardware debounce filter; all times are ms.
"""
from dataclasses import dataclass, field

@dataclass
class PowerButtonModel:
    state: str = 'RUNNING'
    external_power: bool = True
    now: int = 0
    boot_id: str = 'boot-1'
    controller_boot_id: str = 'controller-1'
    events: list = field(default_factory=list)
    down_at: int | None = None
    origin: str | None = None
    normal_allowed_at_down: bool = False
    pending_single_at: int | None = None
    second: bool = False
    suppress_short: bool = False
    short_block_until: int = 0
    long_indicated: bool = False
    force_requested: bool = False
    ready: bool = True
    armed: bool = True
    capture_enabled: bool = False
    sequence: int = 0
    delivered: set = field(default_factory=set)

    def emit(self, name, at=None):
        self.sequence += 1
        self.events.append({'event': name, 'atMs': self.now if at is None else at,
                            'sequence': self.sequence, 'bootId': self.boot_id})

    def advance(self, t):
        if type(t) is not int or t < self.now:
            raise ValueError('time must be a nondecreasing integer')
        self.now = t
        if not self.external_power:
            return
        if self.down_at is not None:
            held = t - self.down_at
            # A press that started in OFF only initiates one boot. Releasing is mandatory.
            if self.origin != 'OFF' and self.armed:
                if held >= 3000 and not self.long_indicated:
                    self.long_indicated = True
                    self.pending_single_at = None
                    self.emit('LONG_FEEDBACK', self.down_at + 3000)
                if held >= 10000 and not self.force_requested:
                    self.force_requested = True
                    self.pending_single_at = None
                    self.emit('FORCE_OFF_REQUEST', self.down_at + 10000)
                    # Actual OFF requires measured device-power feedback, not this request.
        elif self.pending_single_at is not None and t >= self.pending_single_at:
            deadline = self.pending_single_at
            self.pending_single_at = None
            self.single(deadline)

    def down(self, t):
        self.advance(t)
        if self.down_at is not None:
            return  # duplicate edge cannot restart a hold timer
        self.down_at = t
        self.origin = self.state
        self.normal_allowed_at_down = self.ready and self.state in ('RUNNING', 'USER_STANDBY')
        self.long_indicated = False
        self.force_requested = False
        self.suppress_short = t < self.short_block_until
        self.second = self.pending_single_at is not None and t < self.pending_single_at
        if not self.external_power or not self.armed:
            return
        if self.state == 'OFF':
            self.pending_single_at = None
            self.state = 'BOOTING'
            self.ready = False
            self.capture_enabled = False
            self.emit('BOOT_REQUEST')

    def up(self, t):
        self.advance(t)
        if self.down_at is None:
            return
        duration = t - self.down_at
        origin = self.origin
        force = self.force_requested
        was_second = self.second
        suppressed = self.suppress_short
        self.down_at = None
        self.origin = None
        if not self.external_power:
            return
        if not self.armed:
            self.armed = True
            self.pending_single_at = None
            self.short_block_until = t + 350
            self.emit('REARMED_AFTER_RELEASE')
            return
        if origin == 'OFF' or force:
            self.pending_single_at = None
            self.short_block_until = t + 1000
            return
        if not self.normal_allowed_at_down:
            self.pending_single_at = None
            self.emit('NORMAL_GESTURE_IGNORED_FROM_TRANSITION')
            return
        if duration >= 3000:
            self.pending_single_at = None
            if self.state in ('RUNNING', 'USER_STANDBY') and self.ready:
                self.emit('GRACEFUL_SHUTDOWN_REQUEST')
            else:
                self.emit('NORMAL_LONG_IGNORED_IN_TRANSITION')
            return
        if duration < 50:
            if was_second and self.pending_single_at is not None and t >= self.pending_single_at:
                deadline = self.pending_single_at
                self.pending_single_at = None
                self.single(deadline)
            return
        if duration > 500:
            self.pending_single_at = None
            self.emit('INCOMPLETE_LONG_NO_ACTION')
            return
        if self.state not in ('RUNNING', 'USER_STANDBY') or not self.ready:
            self.pending_single_at = None
            self.emit('SHORT_IGNORED_IN_TRANSITION')
            return
        if suppressed:
            self.pending_single_at = None
            self.short_block_until = max(self.short_block_until, t + 350)
            self.emit('EXTRA_TAP_IGNORED')
            return
        if was_second:
            self.pending_single_at = None
            self.capture_enabled = False
            self.state = 'RUNNING'
            self.emit('SHOW_HOME_OR_LOCK_SCREEN')
            self.short_block_until = t + 350
        else:
            self.pending_single_at = t + 350

    def single(self, at):
        if self.state == 'RUNNING' and self.ready:
            self.capture_enabled = False
            self.state = 'USER_STANDBY'
            self.emit('ENTER_USER_STANDBY', at)
        elif self.state == 'USER_STANDBY' and self.ready:
            self.capture_enabled = False
            self.state = 'RUNNING'
            self.emit('RESUME_UI_WITH_INPUT_OFF', at)

    def host_ready(self, t, boot_id):
        self.advance(t)
        self.boot_id = boot_id
        self.ready = True
        self.pending_single_at = None
        self.state = 'RUNNING'
        self.capture_enabled = False

    def shutdown_ack(self, t):
        self.advance(t)
        self.pending_single_at = None
        self.state = 'SHUTTING_DOWN'
        self.ready = False
        self.capture_enabled = False

    def enter_update(self, t):
        self.advance(t)
        self.pending_single_at = None
        self.state = 'UPDATING'
        self.ready = False

    def confirmed_off(self, t):
        self.advance(t)
        self.state = 'OFF'
        self.ready = False
        self.capture_enabled = False
        self.pending_single_at = None
        # Do not allow the still-held press to trigger another power-on or force request.
        if self.down_at is not None:
            self.origin = 'OFF'

    def lose_external_power(self, t):
        self.advance(t)
        self.external_power = False
        self.ready = False
        self.state = 'NO_POWER'
        self.pending_single_at = None
        self.down_at = None
        self.capture_enabled = False

    def restore_external_power(self, t, pressed=False):
        self.advance(t)
        self.external_power = True
        self.state = 'OFF'
        self.ready = False
        self.armed = not pressed
        self.pending_single_at = None
        self.down_at = t if pressed else None
        self.origin = 'OFF' if pressed else None
        # Power restoration itself does not emit BOOT_REQUEST.

    def accept_os_event(self, *, boot_id, sequence, age_ms, controller_boot_id='controller-1'):
        if controller_boot_id != self.controller_boot_id or boot_id != self.boot_id or type(sequence) is not int or sequence < 0:
            return False
        if type(age_ms) is not int or not 0 <= age_ms <= 2000:
            return False
        key = (controller_boot_id, boot_id, sequence)
        if key in self.delivered:
            return False
        self.delivered.add(key)
        return True


def qualify_edges(samples, debounce_ms=30):
    """Model a sampled stable-level filter. Feed regular samples to exercise it.
    Initial level is released. Returns qualified (timestamp, pressed) edges.
    """
    stable = False
    candidate = False
    since = None
    previous = -1
    out = []
    for t, pressed in samples:
        if type(t) is not int or t < previous or type(pressed) is not bool:
            raise ValueError('invalid sample')
        previous = t
        if pressed != candidate:
            candidate = pressed
            since = t
        if candidate != stable and since is not None and t - since >= debounce_ms:
            stable = candidate
            out.append((t, stable))
    return out
