"""Runnable examples use the public SDK over actual independent TLS authorities."""
from dataclasses import asdict
import importlib.util
import json
import time
import unittest
import test_game_exchange_tls as support
from game_exchange import protocol as p
from game_exchange.exchange_gateway import ExchangeGateway
from game_exchange.exchange_signer import PublicExchangeSigner
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('owner_example',ROOT/'examples/game/owner.py');example=importlib.util.module_from_spec(spec);spec.loader.exec_module(example)

class RunnableExamples(unittest.TestCase):
    def setUp(self):
        self.f=support.ExchangeTLS();self.f.setUp();self.addCleanup(self.f.doCleanups);self.f.now=int(time.time())
        peers={a.game.game_id:support.SimpleNamespace(asset='COIN_'+a.name.upper(),terminal_key=PublicExchangeSigner(a.game.game_authority_id,'terminal').record) for a in self.f.authorities}
        self.f.runtimes['alice'].bind_game_exchanges(peers,start_workers=False);self.workers=self.f.live_games()['alice'];self.f.server.exchange_gateway=ExchangeGateway(self.f.gateway)
        def keys(values):return [dict(asdict(k),public_key=p.b64(k.public_key)) for k in values]
        t=self.f.transports[support.A1]
        self.config={'schema':'rock-game-reference-owner-config/1','origin':t.origin,'ca_file':'os/registry/fixtures/development-ca.pem',
            'authority_id':t.authority_id,'device_ref':t.device_ref,'public_owner_token':t.token,
            'connection_keys':keys(self.f.gateway.keys.records.values()),'exchange_keys':keys(self.f.runtimes['alice']._exchanges.keys.records.values()),
            'games':[{'record':dict(asdict(a.game),scopes=list(a.game.scopes)),'proof_origin':'https://127.0.0.1:'+str(server.server_port),
                'player_session':a.public_session('alice')} for a,server in zip(self.f.authorities,self.f.game_servers)]}
    def test_new_client_registration_consent_quote_purchase_history_and_diagnosis(self):
        state=self.f.root/'example';client=example.OwnerExample(self.config,state)
        try:
            initial=client.diagnose();self.assertEqual(initial['contact'],'VERIFIED_OWNER_TLS');self.assertEqual(initial['pending'],[])
            setup=client.setup_wallet();self.assertEqual(setup['available_minor'],15000)
            for name in ('a','b'):
                game='public-game-'+name;consent=client.connect(game);self.assertEqual(consent['binding']['game_id'],game)
                quote=client.quote(game,'same-key');self.assertEqual(quote['binding']['total_minor'],103)
                reply=client.approve(game,'same-key');self.assertEqual(reply['decision'],'APPROVED')
                self.workers[name].once();status=client.status(game,'same-key');self.assertEqual(status['state'],'COMPLETED')
            self.assertEqual(client.diagnose()['pending'],[])
        finally:client.close()
        client=example.OwnerExample(self.config,state)
        try:
            self.assertEqual(client.status('public-game-a','same-key')['state'],'COMPLETED')
            self.assertEqual(client.setup_wallet()['available_minor'],14794) # replay exact setup cannot recredit/re-enroll
            self.assertEqual(client.approve('public-game-a','same-key')['decision'],'APPROVED')
            self.assertEqual(self.f.grants['a'].balance('alice'),10)
        finally:client.close()

    def test_diagnosis_marks_cached_snapshot_unavailable_and_retains_original_pending(self):
        client=example.OwnerExample(self.config,self.f.root/'offline-example');self.addCleanup(client.close)
        self.assertEqual(client.diagnose()['contact'],'VERIFIED_OWNER_TLS')
        client.setup_wallet()
        client.connect('public-game-a')
        self.f.server.shutdown();self.f.thread.join(5);self.assertFalse(self.f.thread.is_alive())
        self.f.server.server_close();self.f.server=None
        with self.assertRaises(OSError):client.quote('public-game-a','original-offline-key')
        pending=client.sdk.pending();self.assertEqual(len(pending),1)
        self.assertEqual(pending[0]['key'],'original-offline-key')
        diagnosed=client.diagnose()
        self.assertEqual(diagnosed['contact'],'OWNER_TLS_UNAVAILABLE')
        self.assertIs(diagnosed['wallet_snapshot']['backend']['connected'],False)
        self.assertIs(diagnosed['wallet_snapshot']['backend']['stale'],True)
        self.assertEqual(diagnosed['pending'],pending);self.assertEqual(client.sdk.pending(),pending)

if __name__=='__main__':unittest.main()
