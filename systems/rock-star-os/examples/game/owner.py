#!/usr/bin/env python3
"""Runnable public synthetic owner example: no Wallet/Game authority or author key."""
import argparse
from contextlib import ExitStack
from dataclasses import asdict
import hashlib
import json
import os
from pathlib import Path
import sys
import time
ROOT=Path(__file__).resolve().parents[2]
sys.path[:0]=[str(ROOT/'src'),str(ROOT/'os')]
from game_exchange import protocol as p,exchange_protocol as x
from game_exchange.device_client import key_records
from game_exchange.reference_sdk import ReferenceOwnerClient
from game_exchange.http import GameTransport
from wallet_backend.client import HTTPSWalletTransport,RemoteWalletService,read_protected
from wallet_auth.fixture import SoftwareTestAuthenticator


def result(reply):
    if reply.get('ok') is not True:raise ValueError('authority rejected request: '+reply.get('code','unknown'))
    return reply.get('result',reply.get('snapshot'))


def load_config(path):
    value=p.decode(read_protected(path,16384));p.fields(value,{'schema','origin','ca_file','authority_id','device_ref',
        'public_owner_token','games','connection_keys','exchange_keys'})
    p.require(value['schema']=='rock-game-reference-owner-config/1','owner sample config required')
    p.require(value['public_owner_token'].startswith('PUBLIC-'),'only explicitly public synthetic credentials are supported')
    p.require(type(value['games']) is list and 1<=len(value['games'])<=2,'bounded public games required')
    for item in value['games']:p.fields(item,{'record','proof_origin','player_session'})
    return value


class OwnerExample:
    def __init__(self,config,state):
        self.config=config;self.state=Path(state);p.require(self.state.is_absolute() and self.state.resolve()==self.state,'canonical client state required')
        self.state.mkdir(mode=0o700,exist_ok=True);self.stack=ExitStack()
        try:
            token=self.state/'public-owner-token'
            try:
                fd=os.open(token,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
                with os.fdopen(fd,'wb') as stream:stream.write(config['public_owner_token'].encode());stream.flush();os.fsync(stream.fileno())
            except FileExistsError:p.require(read_protected(token,300,private=True).decode()==config['public_owner_token'],'original client credential required')
            ca=ROOT/config['ca_file'];self.transport=HTTPSWalletTransport(config['origin'],ca,token,
                authority_id=config['authority_id'],device_ref=config['device_ref'],protocol_version=3)
            self.wallet=RemoteWalletService(self.state/'wallet-client',self.transport);self.stack.callback(self.wallet.close)
            self.auth=SoftwareTestAuthenticator(self.state/'owner-authenticator',config['device_ref']);self.stack.callback(self.auth.close)
            games=tuple(p.GameRecord(**dict(i['record'],scopes=tuple(i['record']['scopes']))) for i in config['games'])
            self.sdk=ReferenceOwnerClient(self.state/'sdk',self.transport,games=games,
                connection_keys=p.KeyRegistry(key_records(config['connection_keys'])),exchange_keys=x.KeyRegistry(key_records(config['exchange_keys'])))
            self.stack.callback(self.sdk.close)
            self.proofs={i['record']['game_id']:GameTransport(i['proof_origin'],ca,i['record']['game_id'],token=i['player_session'],endpoint='/v1/player/proof') for i in config['games']}
        except BaseException:self.close();raise
    def close(self):self.stack.close()
    def wallet_call(self,op,**fields):return result(self.wallet.dispatch({'v':1,'op':op,**fields},peer_uid=1002))
    def setup_wallet(self):
        self.wallet_call('wallet.register',key='sample-register')
        options=self.wallet_call('wallet.auth.begin',key='sample-enroll-begin')
        credential=self.auth.make_credential(options['options'],'0000','sample-enroll')
        self.wallet_call('wallet.auth.enroll',key='sample-enroll',challenge_id=options['challenge_id'],credential=credential)
        self.wallet_call('wallet.terms',key='sample-wallet-terms',accepted=True,terms_version='rock-wallet-development/1')
        result(self.sdk.dispatch('*',{'v':1,'op':'game.sandbox.credit','key':'sample-explicit-test-credit','amount_minor':10000}))
        return self.wallet_call('snapshot')
    def connect(self,game):
        intent=result(self.sdk.begin_connection(game,'sample-connect',self.proofs[game]))
        credential=self.auth.get_game_assertion(intent,'0000','sample-connect-'+game)
        return result(self.sdk.dispatch(game,{'v':1,'op':'game.connection.approve','key':'sample-connect-approve',
            'intent_id':intent['binding']['intent_id'],'challenge_id':intent['challenge_id'],'binding_sha256':intent['binding_sha256'],'credential':credential}))
    def connection(self,game):
        with self.sdk.connections[game].store.transaction() as db:
            row=db.execute('SELECT connection_id FROM bindings WHERE consent IS NOT NULL ORDER BY rowid LIMIT 1').fetchone()
            p.require(row is not None,'GAME_NOT_CONNECTED: run connect with explicit synthetic consent');return row[0]
    def quote(self,game,exchange):return result(self.sdk.dispatch(game,{'v':1,'op':'game.exchange.quote','key':exchange,
        'connection_id':self.connection(game),'exchange_id':exchange,'principal_minor':100}))
    def approve(self,game,exchange):
        quote=result(self.sdk.retry(game,'game.exchange.quote',exchange))
        intent=result(self.sdk.dispatch(game,{'v':1,'op':'game.exchange.approval.begin','key':exchange,'quote_id':quote['binding']['quote_id']}))
        credential=self.auth.get_exchange_assertion(intent,'0000','sample-buy-'+game+'-'+exchange)
        return result(self.sdk.dispatch(game,{'v':1,'op':'game.exchange.approve','key':exchange,
            'attempt_id':intent['attempt_id'],'quote_sha256':x.quote_digest(quote),'credential':credential}))
    def status(self,game,exchange):return result(self.sdk.dispatch(game,{'v':1,'op':'game.exchange.status',
        'connection_id':self.connection(game),'exchange_id':exchange}))
    def diagnose(self):
        pending=self.sdk.pending();connections={game:client.pending() for game,client in self.sdk.connections.items()}
        try:
            snapshot=self.wallet_call('snapshot')
            backend=snapshot.get('backend',{})
            contact='VERIFIED_OWNER_TLS' if backend.get('connected') is True and backend.get('stale') is False else 'OWNER_TLS_UNAVAILABLE'
        except OSError:snapshot=None;contact='OWNER_TLS_UNAVAILABLE'
        return {'schema':'rock-game-sdk-diagnostic/1','contact':contact,'pending':pending,'connection_pending':connections,
            'wallet_snapshot':snapshot,'recovery':'Restore the configured authority connection, then retry the listed original operation/key; retain this client state.',
            'simulation_only':True}


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--config',type=Path,required=True);parser.add_argument('--state',type=Path,required=True)
    parser.add_argument('action',choices=('wallet','connect','quote','approve','status','history','diagnose','retry'))
    parser.add_argument('--game',choices=('a','b'),default='a');parser.add_argument('--exchange-id',default='sample-purchase')
    parser.add_argument('--operation');parser.add_argument('--key');parser.add_argument('--accept-public-simulation',action='store_true')
    args=parser.parse_args(argv);start=time.monotonic();client=None
    try:
        if args.action in ('wallet','connect','approve'):p.require(args.accept_public_simulation,'explicit --accept-public-simulation required; review terms/quote first')
        config=load_config(args.config);client=OwnerExample(config,args.state);game='public-game-'+args.game
        if args.action=='wallet':value=client.setup_wallet()
        elif args.action=='connect':value=client.connect(game)
        elif args.action in ('quote','approve','status'):value=getattr(client,args.action)(game,args.exchange_id)
        elif args.action=='history':value=result(client.sdk.dispatch('*',{'v':1,'op':'game.exchange.list','limit':50,'after':None}))
        elif args.action=='diagnose':value=client.diagnose()
        else:p.require(args.operation is not None and args.key is not None,'retry requires original operation and key');value=result(client.sdk.retry(game,args.operation,args.key))
        print(json.dumps({'ok':True,'result':value,'elapsed_seconds':time.monotonic()-start,'simulation_only':True},sort_keys=True));return 0
    except (ValueError,OSError) as exc:
        print(json.dumps({'ok':False,'error':str(exc),'error_type':type(exc).__name__,'elapsed_seconds':time.monotonic()-start,
            'next':'Keep client state. Run diagnose; retry only the original operation/key after fixing the reported cause.','simulation_only':True},sort_keys=True));return 1
    finally:
        if client is not None:client.close()

if __name__=='__main__':raise SystemExit(main())
