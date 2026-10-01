"""Guest Wallet facade for the explicit public Game authority profile.

Only client state lives in the OS: retained exact requests and verified receipt
copies. Hub health never depends on Game or Wallet authority availability.
"""
from dataclasses import fields
from pathlib import Path
import time
from entitlement.device import DeviceWalletAdapter
from wallet_backend.client import read_protected,HTTPSWalletTransport,RemoteWalletService
from . import protocol as p
from . import exchange_protocol as x
from .http import GameTransport
from .reference_sdk import ReferenceOwnerClient
from .client import _loaded

MODE='development-game-authority'
AUTHORITY='6fdcc9a6-90c7-4e28-a165-aadf9c904910'
DEVICE='fixture-rock-arm64-001'
WALLET_TOKEN='PUBLIC-FIXTURE-ROCK-GAME-OWNER-ALICE-20260910-v1'


def key_records(values):
    p.require(type(values) is list and 1<=len(values)<=16,'bounded pinned public key list required')
    records=[]
    for value in values:
        p.fields(value,{field.name for field in fields(p.KeyRecord)})
        records.append(p.KeyRecord(**dict(value,public_key=p.unb64(value['public_key'],32,32))))
    return tuple(records)


def configuration(value):
    p.fields(value,{'schema_version','mode','origin','ca_file','token_file','authority_id','device_ref','games','connection_keys','exchange_keys'})
    p.require(type(value['schema_version']) is int and value['schema_version']==4 and value['mode']==MODE and
        value['authority_id']==AUTHORITY and value['device_ref']==DEVICE,'fixed public development Game profile required')
    p.require(value['origin']=='https://10.0.2.2:9641' and value['ca_file']=='/usr/share/rock/development-store-ca.pem' and
        value['token_file']=='/etc/rock-wallet/backend-token','fixed guest development Game endpoints required')
    p.require(type(value['games']) is list and len(value['games'])==2,'exactly two synthetic games required')
    games=[];transports={}
    for index,name in enumerate(('a','b')):
        record=value['games'][index];p.fields(record,{'record','proof_origin','player_session'})
        expected={'author_id':'public-author-'+name,'game_authority_id':'public-game-authority-'+name,'game_id':'public-game-'+name,
            'game_name':'Public Game '+name.upper(),'revision':1,'scopes':list(p.SCOPES)}
        p.require(record['record']==expected and record['proof_origin']=='https://10.0.2.2:'+str(9642+index) and
            record['player_session']=='PUBLIC-GAME-PLAYER-SESSION-'+name+'-alice-v1','fixed public game/player endpoint mismatch')
        games.append(p.GameRecord(**dict(expected,scopes=tuple(expected['scopes']))))
    connection_keys=p.KeyRegistry(key_records(value['connection_keys']));exchange_keys=x.KeyRegistry(key_records(value['exchange_keys']))
    p.require({(r.issuer,r.purpose) for r in connection_keys.records.values()}=={
        ('public-game-authority-a',p.PURPOSES['proof']),('public-game-authority-b',p.PURPOSES['proof']),
        (AUTHORITY,p.PURPOSES['shared']),(AUTHORITY,p.PURPOSES['cursor'])},'fixed connection key purposes required')
    p.require({(r.issuer,r.purpose) for r in exchange_keys.records.values()}=={
        (AUTHORITY,x.PURPOSES['quote']),(AUTHORITY,x.PURPOSES['approval']),
        ('public-game-authority-a',x.PURPOSES['terminal']),('public-game-authority-b',x.PURPOSES['terminal'])},'fixed purchase key purposes required')
    return tuple(games),connection_keys,exchange_keys


class GameWalletFacade:
    def __init__(self,state,transport,*,games,connection_keys,exchange_keys,proof_transports,clock=time.time):
        Path(state).mkdir(mode=0o700,exist_ok=True)
        self.wallet=RemoteWalletService(Path(state)/'backend-cache',transport,clock=clock)
        self.sdk=None;self.proof_transports=proof_transports
        try:self.sdk=ReferenceOwnerClient(Path(state)/'game-client',transport,games=games,connection_keys=connection_keys,exchange_keys=exchange_keys,clock=clock)
        except BaseException:self.wallet.close();raise
    def close(self):
        if self.sdk is not None:self.sdk.close()
        self.wallet.close()
    def dispatch(self,request,*,peer_uid=None):
        DeviceWalletAdapter._peer(peer_uid)
        p.require(type(request) is dict and type(request.get('v')) is int and request['v']==1,'versioned Wallet request required')
        op=request.get('op')
        if type(op) is not str or not op.startswith('game.'):return self.wallet.dispatch(request,peer_uid=peer_uid)
        if op=='game.sandbox.catalog':
            p.fields(request,{'v','op'});return {'ok':True,'result':self.catalog()}
        if op=='game.sandbox.connection.begin':
            p.fields(request,{'v','op','key','game_id'});p.identifier(request['key'],128)
            p.require(request['game_id'] in self.proof_transports,'registered public game required')
            return self.sdk.begin_connection(request['game_id'],request['key'],self.proof_transports[request['game_id']])
        if op.startswith('game.connection.'):p.validate_owner_request(request)
        else:x.request(request)
        return self.sdk.dispatch(self.sdk.game_for(request),request)
    def catalog(self):
        result=[]
        for game_id,client in self.sdk.connections.items():
            game=self.sdk.games[game_id]
            with client.store.transaction() as db:
                row=db.execute('SELECT connection_id,intent,consent FROM bindings ORDER BY rowid LIMIT 1').fetchone()
                unknown=db.execute("SELECT key FROM requests WHERE operation='game.connection.begin' ORDER BY rowid LIMIT 1").fetchone()
                pending_expired=bool(row and row['consent'] is None and client._now(db)>=_loaded(row['intent'])['binding']['intent_expires_at'])
            state='NOT_CONNECTED';connection=None
            if row:
                connection=row['connection_id'];state='EXPIRED' if pending_expired else 'AWAITING_OWNER_CONSENT'
                if row['consent']:
                    fresh=client.dispatch({'v':1,'op':'game.connection.status','connection_id':connection})
                    p.require(fresh['ok'] is True,'current owner connection status required');state=fresh['result']['current_state']
            elif unknown:state='AWAITING_OWNER_CONSENT'
            result.append({'game_id':game_id,'game_name':game.game_name,'player_id':'alice','connection_id':connection,
                'current_state':state,'simulation_only':True})
        with self.sdk.store.transaction() as db:
            credit=db.execute("SELECT 1 FROM requests WHERE operation='game.sandbox.credit' AND receipt IS NOT NULL LIMIT 1").fetchone() is not None
        return {'schema':'rock-game-sandbox-catalog/1','games':result,'fixture_credit_applied':credit,'simulation_only':True}


def configured_service(config_file,wallet_state):
    raw=read_protected(config_file,16384,private=True);value=p.decode(raw)
    games,connection_keys,exchange_keys=configuration(value)
    state=Path(wallet_state)
    remnants=('wallet-simulator.db','wallet-simulator.db-wal','wallet-simulator.db-shm','entitlement.db','entitlement.db-wal',
        'entitlement.db-shm','AUTHORITY.json','GX00-MIGRATION.json','authority.lock')
    p.require(not any((state/name).exists() or (state/name).is_symlink() for name in remnants),'existing local Wallet requires explicit migration; no profile switching')
    transport=HTTPSWalletTransport(value['origin'],value['ca_file'],value['token_file'],authority_id=value['authority_id'],device_ref=value['device_ref'],protocol_version=3)
    p.require(transport.token==WALLET_TOKEN,'only the documented public synthetic owner credential is supported')
    proofs={item['record']['game_id']:GameTransport(item['proof_origin'],value['ca_file'],item['record']['game_id'],
        token=item['player_session'],endpoint='/v1/player/proof') for item in value['games']}
    return GameWalletFacade(state,transport,games=games,connection_keys=connection_keys,exchange_keys=exchange_keys,proof_transports=proofs)
