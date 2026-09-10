"""Pure assertions shared by the disposable purchaser update proof only."""
from contextlib import closing
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import stat

PHASES = {1: ('A', 1, 'committed'), 2: ('B', 2, 'trial'),
          3: ('A', 3, 'trial'), 4: ('A', 3, 'trial'),
          5: ('B', 2, 'attempts-exhausted')}
BAD = (3, 4)
ERROR = 'local purchaser service configuration or retained binding is unavailable'
DATABASES = {'hub': ('/platform/hub.db', 1002),
             'remote': ('/platform/remote/remote.sqlite3', 1002),
             'wallet_cache': ('/wallet/backend-cache/remote-cache.db', 1003),
             'authenticator': ('/authenticator/authenticator.sqlite3', 1004)}


def require(value, message):
    if not value:
        raise AssertionError(message)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False,
                      allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else canonical(value)).hexdigest()


def phase_from_cmdline(cmdline):
    flags = [word for word in cmdline.split() if word.startswith('rock.purchaser.update=')]
    require(len(flags) == 1 and flags[0] in [f'rock.purchaser.update={p}' for p in PHASES],
            'one exact purchaser update phase required')
    return int(flags[0][-1])


def financial(wallet):
    require(isinstance(wallet, dict) and wallet.get('simulation_only') is True, 'simulator Wallet required')
    names = ('available_minor', 'held_minor', 'billed_minor', 'pending_minor',
             'dispensed_minor', 'ledger_balance_minor')
    require(all(type(wallet.get(n)) is int for n in names), 'strict integer Wallet amounts required')
    values = {n: wallet[n] for n in names}
    require(tuple(values.values()) == (4112, 0, 888, 0, 0, 0), 'expected one settled 888 simulator bill')
    membership = wallet['membership']
    require(membership['registered'] is True and membership['entitlement']['auto_renew'] is False,
            'registered cancelled-renewal fixture required')
    require(len(wallet['sales']) == 1 and len(wallet['bills']) == 1 and
            wallet['bills'][0]['amount_minor'] == 888 and not wallet['withdrawals'], 'financial fixture shape differs')
    histories = {name: wallet[name] for name in ('sales', 'bills', 'journals', 'withdrawals', 'consent')}
    return {**values, 'bill_count': 1, 'sales_count': 1, 'auto_renew': False,
            'account_id_sha256': digest(membership['entitlement']['account_id'].encode()),
            'history_sha256': digest(histories)}


def database_summary(path, role, expected_uid=None):
    """Read-only live/closed logical comparison; never publish raw private rows."""
    path = Path(path)
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and not info.st_mode & 0o077,
            'private database inode differs')
    require(expected_uid is None or info.st_uid == expected_uid, 'private database owner differs')
    used = 0
    with closing(sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=5)) as db:
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA query_only=ON'); db.execute('BEGIN')
        require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'database integrity failed')
        require(db.execute('PRAGMA foreign_key_check').fetchone() is None, 'database foreign keys failed')
        schema = [dict(r) for r in db.execute('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name')]
        names = sorted(r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'"))
        if role == 'wallet_cache':
            require(names == ['identity', 'requests', 'snapshot'], 'cache contains non-cache tables')
            require(db.execute('SELECT COUNT(*) FROM identity').fetchone()[0] == 1 and
                    db.execute('SELECT COUNT(*) FROM requests WHERE response IS NULL').fetchone()[0] == 0,
                    'cache identity missing or owner mutation unresolved')
        tables = {}
        for name in names:
            require(re.fullmatch('[A-Za-z_][A-Za-z0-9_]*', name), 'unexpected SQLite identifier')
            if role == 'wallet_cache' and name == 'snapshot':
                # UI reads can legitimately advance received_at. Financial
                # contents are independently joined to owner-visible history.
                continue
            rows = []
            for row in db.execute('SELECT * FROM "' + name + '" LIMIT 4097'):
                require(len(rows) < 4096, 'private row limit')
                value = {k: {'bytes_hex': v.hex()} if isinstance(v, bytes) else v for k, v in dict(row).items()}
                raw = canonical(value); used += len(raw)
                require(len(raw) <= 512 * 1024 and used <= 16 * 1024**2, 'private snapshot byte limit')
                rows.append(raw.decode())
            tables[name] = {'rows': len(rows), 'sha256': digest(sorted(rows))}
    return {'schema_sha256': digest(schema), 'tables': tables, 'integrity': 'ok', 'foreign_keys': 'ok'}


def validate_boot(log, phase, proof, expected_image):
    require(phase in PHASES and proof['phase'] == phase and proof['status'] == 'PASS', 'phase proof not PASS')
    slot, sequence, reason = PHASES[phase]
    selected = f'ROCK_AB_SELECTED slot={slot} sequence={sequence} reason={reason}'
    require(log.count(selected) == 1 and f'ROCK_AB_SWITCH_ROOT device={"/dev/vda" if slot == "A" else "/dev/vdc"}' in log,
            'actual stage0 selection differs')
    require(proof['boot']['slot'] == slot and proof['boot']['sequence'] == sequence and
            proof['boot']['reason'] == reason and proof['boot']['sha256'] == expected_image,
            'guest mounted image identity differs')
    require(all(word not in log for word in ('ROCK_AB_RECOVERY', 'Kernel panic',
                'ROCK_PURCHASER_UPDATE_FAIL', 'ROCK_AB_WATCHDOG_REBOOT')), 'guest failure or watchdog rescue')
    require(proof['children'] and all(child['uid'] == child['gid'] == 1000 and child['groups'] == []
                                    and child['peer_uid'] in (1002, 1004) for child in proof['children']),
            'actual owner IPC identity missing')
    if phase in BAD:
        require('ROCK_AB_HEALTH_CONFIRMED' not in log and 'ROCK_AB_HEALTH_FAILED_REBOOT' in log and
                ERROR in log and proof['health_denial']['ok'] is False and
                proof['health_denial']['code'] == 'rejected' and proof['health_denial']['error'] == ERROR,
                'service-only loss did not cause explicit health rejection')
        require(proof['service_access']['mode'] == 'purchaser-fixture' and
                proof['service_access']['state'] == 'unavailable' and
                proof['wallet_daemon_healthy'] is True and proof['closed_configuration_absent'] is True,
                'closed outage incorrectly fell back or Wallet also failed')
        require(proof['update_state']['committed'] == 'B' and proof['update_state']['pending'] == 'A' and
                proof['update_state']['floor'] == 2 and proof['update_state']['attempts_left'] == 4-phase,
                'failed candidate was committed or trial count differs')
    else:
        require('ROCK_AB_HEALTH_CONFIRMED' in log and 'ROCK_AB_HEALTH_FAILED_REBOOT' not in log and
                'EXT4-fs (vdb): unmounting filesystem' in log and 'reboot: Power down' in log,
                'normal good-boot health/unmount/poweroff missing')
        require(proof['service_access']['mode'] == 'purchaser-fixture' and
                proof['service_access']['state'] == 'configured', 'healthy boot lost purchaser configuration')
        require(proof['update_state'] == {'committed': slot, 'pending': None,
                'floor': sequence, 'attempts_left': 0}, 'healthy boot did not commit the expected safe floor')
    if phase > 1:
        require(proof['history_matches_initial'] is True, 'retained business history changed')


def compare_retained(before, after):
    require(set(before) == set(after) == {'databases', 'binding_sha256', 'personal_file_sha256',
                                        'financial', 'wallet_config_sha256', 'auth_config_sha256'},
            'retained history coverage differs')
    require(before == after, 'private Tool/Wallet/owner history changed across update')
