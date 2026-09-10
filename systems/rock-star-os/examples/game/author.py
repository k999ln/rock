#!/usr/bin/env python3
"""Separate public author example: offer a quote and read its signed outcome."""
import argparse
import json
from pathlib import Path
import sys
import time
ROOT=Path(__file__).resolve().parents[2]
sys.path[:0]=[str(ROOT/'src'),str(ROOT/'os')]
from game_exchange import protocol as p
from game_exchange.device_client import key_records
from game_exchange.http import GameTransport
from game_exchange.reference_sdk import ReferenceAuthorClient
from wallet_backend.client import read_protected


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--config',type=Path,required=True);parser.add_argument('--state',type=Path,required=True)
    parser.add_argument('action',choices=('quote','status','pending','retry'));parser.add_argument('--game',choices=('a','b'),required=True)
    parser.add_argument('--connection-id');parser.add_argument('--exchange-id',default='sample-purchase');parser.add_argument('--key',default='sample-purchase')
    args=parser.parse_args(argv);started=time.monotonic();client=None
    try:
        config=p.decode(read_protected(args.config,16384));p.fields(config,{'schema','origin','ca_file','authority_id','games'})
        p.require(config['schema']=='rock-game-reference-author-config/1','separate author sample config required')
        item=next(i for i in config['games'] if i['record']['game_id']=='public-game-'+args.game)
        p.fields(item,{'record','public_author_token','terminal_key'});p.require(item['public_author_token'].startswith('PUBLIC-'),'explicit public synthetic author only')
        game=p.GameRecord(**dict(item['record'],scopes=tuple(item['record']['scopes'])))
        transport=GameTransport(config['origin'],ROOT/config['ca_file'],game.game_id,token=item['public_author_token'],endpoint='/v1/game-exchange')
        client=ReferenceAuthorClient(args.state,transport,game=game,wallet_authority_id=config['authority_id'],terminal_key=key_records([item['terminal_key']])[0])
        if args.action=='pending':value=client.pending()
        elif args.action=='retry':value=client.retry(args.key)
        else:
            request={'v':1,'op':'exchange.'+args.action,'connection_id':args.connection_id,'exchange_id':args.exchange_id}
            if args.action=='quote':request.update(key=args.key,principal_minor=100)
            value=client.dispatch(request)
        print(json.dumps({'ok':True,'result':value,'elapsed_seconds':time.monotonic()-started,'simulation_only':True},sort_keys=True));return 0
    except (ValueError,OSError,StopIteration) as exc:
        print(json.dumps({'ok':False,'error':str(exc),'error_type':type(exc).__name__,'simulation_only':True},sort_keys=True));return 1
    finally:
        if client is not None:client.close()

if __name__=='__main__':raise SystemExit(main())
