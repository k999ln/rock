"""TEST ONLY: reference AP/control protocol and carrier quota authority.

No Wi-Fi cryptography/radio or real satellite/provider is emulated as accepted.
"""
import copy
import hmac
import json
import os
from pathlib import Path
import socket
import sqlite3
import threading

from controller import require, fields, number, identity, validate_policy
from ap_control import HostapdControl, read_private
from network_quota import canonical, digest, signature, strict_object


class ReferenceAP:
    def __init__(self, directory, interface, credential_directory):
        self.directory, self.interface = Path(directory), interface
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.credentials = Path(credential_directory)
        self.socket = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
        self.path = self.directory / interface
        self.socket.bind(str(self.path)); os.chmod(self.path, 0o600)
        self.socket.settimeout(.1)
        self.enabled = False
        self.generation = None
        self.stations = {}
        self.commands = []
        self.running = True
        self.reply_override = None
        self.thread = threading.Thread(target=self._run, daemon=True); self.thread.start()

    def claim(self, directory, lock):
        pass  # Protocol fixture; production uses OwnedHostapd and process locks.

    def radio_config(self):
        return b''  # No radio in this protocol fixture.

    def stop(self):
        self.enabled = False
        self.stations.clear()
        self.generation = None

    def deploy(self, config, credentials):
        self.stop()
        self.generation = (read_private(config), read_private(credentials))

    def verify_loaded(self, config, credentials):
        require(self.generation == (read_private(config), read_private(credentials)), 'ap_generation_unproven')

    def request(self, command):
        return HostapdControl(self.directory, self.interface).request(command)

    def associate(self, mac, key, pmf=True):
        keys = dict(line.split() for line in (self.credentials / 'clients.psk').read_text().splitlines())
        ok = self.enabled and mac in keys and hmac.compare_digest(keys[mac], key) and pmf
        if ok:
            self.stations[mac] = '[AUTH][ASSOC][AUTHORIZED][MFP]'
        return ok

    def _run(self):
        while self.running:
            try: raw, peer = self.socket.recvfrom(16384)
            except socket.timeout: continue
            except OSError: break
            command = raw.decode(); self.commands.append(command)
            if command == 'DISABLE':
                reply = 'OK' if self.enabled else 'FAIL'
                self.enabled = False; self.stations.clear()
            elif command == 'RELOAD': self.stations.clear(); reply = 'OK'
            elif command == 'ENABLE': self.enabled = True; reply = 'OK'
            elif command == 'STATUS': reply = f'state={"ENABLED" if self.enabled else "DISABLED"}\nbss[0]={self.interface}\nssid[0]=Mini'
            elif command == 'GET_CONFIG': reply = 'wpa=2\nkey_mgmt=WPA-PSK\nrsn_pairwise_cipher=CCMP'
            elif command.startswith('STA '):
                mac = command[4:]; reply = mac + '\nflags=' + self.stations[mac] if mac in self.stations else 'FAIL'
            elif command == 'PING': reply = 'PONG'
            else: reply = 'FAIL'
            if self.reply_override: reply = self.reply_override(command, reply)
            try: self.socket.sendto(reply.encode(), peer)
            except OSError: pass

    def close(self):
        self.running = False; self.thread.join(timeout=1); self.socket.close(); self.path.unlink(missing_ok=True)


class ReferenceNetwork:
    """Already provisioned account; reserve NEVER changes caps or tariffs."""
    def __init__(self, path, policy, key, clock):
        validate_policy(policy)
        self.path, self.policy, self.key, self.clock = Path(path), copy.deepcopy(policy), key, clock
        self.transform = None
        self.fail_after_effect = False
        with sqlite3.connect(self.path) as db:
            db.execute('CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY, body TEXT NOT NULL)')
            row = db.execute('SELECT body FROM state WHERE id=1').fetchone()
            if row is None:
                state = dict(policySha256=digest(policy), revision=0, usedBytes=0, usedCostMinor=0, grants={})
                db.execute('INSERT INTO state VALUES(1,?)', (canonical(state).decode(),))
            else: require(json.loads(row[0])['policySha256'] == digest(policy), 'fixture_account_policy_changed')

    def _account(self, s):
        active = [g for g in s['grants'].values() if g['state'] == 'reserved']
        return dict(revision=s['revision'], byteCap=self.policy['byteCap'], costCapMinor=self.policy['costCapMinor'],
                    usedBytes=s['usedBytes'], usedCostMinor=s['usedCostMinor'],
                    heldBytes=sum(g['maxBytes'] - g['txBytes'] - g['rxBytes'] for g in active),
                    heldCostMinor=sum(g['maxCostMinor'] - g['costMinor'] for g in active),
                    allTrafficHardStop=True, managementExempt=True)

    def _mutate(self, fn):
        with sqlite3.connect(self.path, timeout=5) as db:
            db.execute('PRAGMA synchronous=FULL'); db.execute('BEGIN IMMEDIATE')
            s = json.loads(db.execute('SELECT body FROM state WHERE id=1').fetchone()[0])
            result = fn(s)
            db.execute('UPDATE state SET body=? WHERE id=1', (canonical(s).decode(),))
            return result

    def exchange(self, raw, auth):
        p = json.loads(raw, object_pairs_hook=strict_object)
        require(hmac.compare_digest(auth, signature(self.key, 'request', p)), 'fixture_request_signature')
        fields(p, 'schema action nonce policySha256 grant grantId')
        require(p['schema'] == 'mini-network-quota/1' and p['policySha256'] == digest(self.policy), 'fixture_contract_mismatch')
        def run(s):
            action = p['action']; now = self.clock(); require(action in ('read', 'close') or now < self.policy['expiresAt'], 'fixture_account_expired')
            if action == 'reserve':
                g = p['grant']; identity(p['grantId']); require(g['grantId'] == p['grantId'], 'fixture_grant_binding')
                old = s['grants'].get(p['grantId'])
                if old: require(old['requestGrantSha256'] == digest(g), 'fixture_idempotency_conflict')
                else:
                    size = number(g['maxBytes'], 1, self.policy['maxGrantBytes'])
                    price = ((size + self.policy['blockBytes'] - 1) // self.policy['blockBytes']) * self.policy['blockPriceMinor'] + self.policy['grantFeeMinor']
                    require(g['costUpperMinor'] == price and now < g['expiresAt'] <= min(now + self.policy['maxGrantSeconds'], self.policy['expiresAt']), 'fixture_grant_terms')
                    a = self._account(s)
                    require(a['usedBytes'] + a['heldBytes'] + size <= a['byteCap'], 'fixture_byte_cap')
                    require(a['usedCostMinor'] + a['heldCostMinor'] + price <= a['costCapMinor'], 'fixture_cost_cap')
                    s['grants'][p['grantId']] = dict(grantId=p['grantId'], requestGrantSha256=digest(g), maxBytes=size,
                        maxCostMinor=price, expiresAt=g['expiresAt'], txBytes=0, rxBytes=0, costMinor=0, state='reserved')
                    s['revision'] += 1
            elif action in ('read', 'close'):
                require(p['grantId'] in s['grants'], 'fixture_unknown_grant')
                if action == 'close' and s['grants'][p['grantId']]['state'] != 'closed':
                    s['grants'][p['grantId']]['state'] = 'closed'; s['revision'] += 1
            else: require(action == 'account', 'fixture_unknown_action')
            return dict(requestSha256=digest(p), policySha256=digest(self.policy), observedAt=now,
                        validUntil=now + 30 if action in ('read', 'close') else min(now + 30, self.policy['expiresAt']), account=self._account(s),
                        grant=copy.deepcopy(s['grants'].get(p['grantId'])) if action != 'account' else None)
        body = self._mutate(run)
        if self.fail_after_effect: raise TimeoutError('fixture lost acknowledgement')
        if self.transform: body = self.transform(body)
        return canonical(dict(payload=body, signature=signature(self.key, 'response', body)))

    def charge(self, grant_id, tx=0, rx=0, cost=0):
        for v in (tx, rx, cost): number(v)
        def run(s):
            g = s['grants'][grant_id]
            require(g['state'] == 'reserved' and self.clock() < g['expiresAt'], 'fixture_network_stopped')
            require(g['txBytes'] + g['rxBytes'] + tx + rx <= g['maxBytes'] and g['costMinor'] + cost <= g['maxCostMinor'], 'fixture_network_cap')
            g['txBytes'] += tx; g['rxBytes'] += rx; g['costMinor'] += cost
            s['usedBytes'] += tx + rx; s['usedCostMinor'] += cost; s['revision'] += 1
        self._mutate(run)
