"""Explicit public synthetic game authorities and purpose-separated signers.

No production key generation, imported private key or real player identity.
Separate authority state authenticates a fixed public player session before
issuing a proof; the request never contains the player identifier.
"""
from dataclasses import asdict
import hashlib
import hmac
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
from . import protocol as p
from .storage import PrivateStore


def _crypto(label,payload=None):
    seed=hashlib.sha256(('PUBLIC-ROCK-GAME-FIXTURE-v1:'+label).encode()).digest()
    with tempfile.TemporaryDirectory(prefix='rock-public-game-sign-') as tmp:
        root=Path(tmp);key=root/'key.der';key.write_bytes(bytes.fromhex('302e020100300506032b657004220420')+seed)
        if payload is None:
            result=subprocess.run(['openssl','pkey','-inform','DER','-in',str(key),'-pubout','-outform','DER'],capture_output=True,check=True,timeout=2)
            p.require(len(result.stdout)==44,'public fixture key encoding');return result.stdout[-32:]
        path=root/'payload';path.write_bytes(payload)
        result=subprocess.run(['openssl','pkeyutl','-sign','-inkey',str(key),'-keyform','DER','-rawin','-in',str(path)],capture_output=True,check=True,timeout=2)
        p.require(len(result.stdout)==64,'public fixture signature encoding');return result.stdout


class PublicReceiptSigner:
    def __init__(self,issuer,purpose):
        p.identifier(issuer);p.require(purpose in ('shared','cursor'),'fixed Wallet signing purpose required')
        self.issuer,self.purpose=issuer,purpose
        self.label=purpose+':'+issuer;self.key_id='public-'+purpose+'-'+issuer
        self.record=p.KeyRecord(self.key_id,1,p.PURPOSES[purpose],issuer,_crypto(self.label),1,p.MAX_INT,None,None)
    def sign(self,value):
        p.require(value['credential_id']==self.key_id and value['credential_revision']==1,'fixed signer identity')
        # Validate the complete fixed schema, not arbitrary bytes or caller domains.
        payload=p.signature_payload(self.purpose,value)
        issuer=value['publication']['wallet_authority_id'] if self.purpose=='shared' else value['issuer']
        p.require(issuer==self.issuer,'fixed signer authority')
        value=p.decode(p.canonical(value));value['signature']=p.b64(_crypto(self.label,payload));return value


class PublicGameAuthority:
    def __init__(self,state,name,*,clock=time.time):
        p.require(name in ('a','b'),'one of the two explicit public game fixtures required')
        self.name,self.clock=name,clock
        self.game=p.GameRecord('public-author-'+name,'public-game-authority-'+name,'public-game-'+name,'Public Game '+name.upper(),1,p.SCOPES)
        self.label='proof:'+self.game.game_authority_id
        self.record=p.KeyRecord('public-proof-'+name,1,p.PURPOSES['proof'],self.game.game_authority_id,_crypto(self.label),1,p.MAX_INT,None,None)
        game_config=asdict(self.game);game_config['scopes']=list(self.game.scopes)
        self.store=PrivateStore(Path(state),{'kind':'public-game-authority/1','game':game_config})
        try:
            with self.store.transaction() as db:
                db.execute('CREATE TABLE IF NOT EXISTS proofs (player TEXT, key TEXT, request TEXT, result TEXT, PRIMARY KEY(player,key))')
        except BaseException:
            self.store.close()
            raise
    def public_session(self,player):
        p.require(player in ('alice','bob'),'fixed public fixture player required')
        return 'PUBLIC-GAME-PLAYER-SESSION-'+self.name+'-'+player+'-v1'
    @property
    def public_author_token(self):return 'PUBLIC-GAME-AUTHOR-CREDENTIAL-'+self.name+'-v1'
    def proof(self,session,request):
        p.fields(request,{'v','op','key','audience','scopes'})
        p.require(type(request['v']) is int and request['v']==1 and request['op']=='connection.proof','proof operation')
        p.identifier(request['key'],128);p.uuid_value(request['audience']);p.validate_scopes(request['scopes'])
        p.require(type(session) is str and len(session)<256,'bounded session')
        matches=[player for player in ('alice','bob') if hmac.compare_digest(session,self.public_session(player))]
        p.require(len(matches)==1,'authenticated public player session required');player=matches[0]
        now=p.integer(int(self.clock()),1)
        with self.store.transaction() as db:
            self.store.observe_time(db,now)
            row=db.execute('SELECT request,result FROM proofs WHERE player=? AND key=?',(player,request['key'])).fetchone()
            if row:
                p.require(row[0]==p.canonical(request).decode(),'player proof retry conflict');return p.decode(row[1].encode())
            p.require(db.execute('SELECT count(*) FROM proofs').fetchone()[0]<10000,'proof capacity')
            proof={'schema':'rock-game-connection-proof/1','environment':'synthetic','game_authority_id':self.game.game_authority_id,
                'game_id':self.game.game_id,'game_revision':1,'player_id':player,'player_display':player.title(),'player_display_revision':1,
                'audience':request['audience'],'nonce':p.b64(secrets.token_bytes(32)),'issued_at':now,'expires_at':now+120,
                'requested_scopes':request['scopes'],'algorithm':'Ed25519','credential_id':self.record.key_id,'credential_revision':1,'signature':p.b64(bytes(64))}
            proof['signature']=p.b64(_crypto(self.label,p.signature_payload('proof',proof)))
            db.execute('INSERT INTO proofs VALUES (?,?,?,?)',(player,request['key'],p.canonical(request).decode(),p.canonical(proof).decode()))
            return proof
    def close(self):self.store.close()
