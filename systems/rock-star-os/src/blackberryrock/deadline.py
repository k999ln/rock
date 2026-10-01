"""Optional request-local deadline for managed component waits.

Legacy callers have no implicit deadline. Managed Game requests and workers
install an absolute monotonic deadline which nested database calls inherit.
"""
from contextlib import contextmanager
import threading
import time

_state=threading.local()

def current(explicit=None):
    inherited=getattr(_state,'deadline',None)
    return explicit if inherited is None else inherited if explicit is None else min(explicit,inherited)

def check(deadline=None):
    deadline=current(deadline)
    if deadline is not None and time.monotonic()>=deadline:raise TimeoutError('managed request deadline elapsed')
    return deadline

@contextmanager
def scope(deadline):
    old=getattr(_state,'deadline',None);_state.deadline=current(deadline)
    try:check();yield
    finally:
        if old is None:
            if hasattr(_state,'deadline'):del _state.deadline
        else:_state.deadline=old

@contextmanager
def locked(lock):
    deadline=check()
    acquired=lock.acquire() if deadline is None else lock.acquire(timeout=max(0,deadline-time.monotonic()))
    if not acquired:raise TimeoutError('managed lock deadline elapsed')
    try:check();yield
    finally:lock.release()

def database(db,deadline=None):
    deadline=check(deadline)
    if deadline is not None:
        db.execute('PRAGMA busy_timeout = '+str(max(1,int((deadline-time.monotonic())*1000))))
        db.set_progress_handler(lambda:int(time.monotonic()>=deadline),1000)
    return deadline
