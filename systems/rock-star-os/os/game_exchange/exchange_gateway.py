"""Separate public exchange author credential; GX00 scopes stay unchanged."""
from dataclasses import dataclass
import hmac
import time
from blackberryrock.deadline import scope,locked
from . import protocol as p
from . import exchange_protocol as x
from .connections import loaded

@dataclass(frozen=True)
class ExchangeAuthor:
    game_authority_id:str
    game_id:str
    revision:int
    expires_at:int

def public_token(name):
    p.require(name in ('a','b'),'public Game fixture required')
    return 'PUBLIC-GAME-EXCHANGE-AUTHOR-'+name+'-v1'

class ExchangeGateway:
    def __init__(self,connections):self.connections=connections
    def current(self,principal):
        p.require(type(principal) is ExchangeAuthor,'exchange author credential required')
        authority=self.connections.authorities.get(principal.game_id)
        p.require(authority is not None and authority.game.game_authority_id==principal.game_authority_id and
            principal.revision==1 and principal.expires_at==1893456000,'registered exchange author required')
        game=authority.game
        self.connections.current_author(p.GamePrincipal(game.author_id,game.game_authority_id,game.game_id,
            principal.revision,game.scopes,principal.expires_at,False))
        return authority
    def authenticate(self,game_id,token):
        p.require(self.connections.bound and type(token) is str and len(token)<=240,'bounded exchange author credential required')
        authority=self.connections.authorities.get(game_id)
        p.require(authority is not None and hmac.compare_digest(token,public_token(authority.name)),'exchange author credential rejected')
        principal=ExchangeAuthor(authority.game.game_authority_id,game_id,1,1893456000);self.current(principal);return principal
    def dispatch(self,principal,request,*,deadline):
        x.request(request,author=True)
        with scope(deadline):
            self.current(principal)
            row=self.connections.index.get('connection_id',request['connection_id'])
            p.require(row is not None and (row['game_authority_id'],row['game_id'])==(principal.game_authority_id,principal.game_id),
                      'connection unavailable to this exchange author')
            runtime=self.connections.runtimes.get(row['ledger_ref'])
            p.require(runtime is not None and getattr(runtime,'_exchanges',None) is not None,'exchange runtime unavailable')
            with runtime.admit_write(runtime.descriptor.writer_epoch,deadline=deadline),locked(self.connections.author_gate):
                self.current(principal);runtime._ensure_account_binding()
                return runtime._exchanges.author(principal,request,deadline)
