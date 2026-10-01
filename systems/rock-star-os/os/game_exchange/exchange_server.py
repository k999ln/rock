"""Real bounded TLS listener for one independent synthetic Game authority."""
import ssl
import threading
from wallet_backend.server import Handler,_TLSWalletListener,MAX_SLOTS,FIXTURES,error
from blackberryrock.deadline import scope
from . import protocol as p

class GameHandler(Handler):
    def do_POST(self):
        self.close_connection=True
        games=self.headers.get_all('X-Rock-Game',[])
        if games!=[self.server.grants.authority.game.game_id]:self.respond(401,error('unauthorized','registered Game required'));return
        self.authenticated_game=games[0]
        try:
            p.require(self.path in ('/v1/grant','/v1/player/proof'),'fixed Game route required')
            auth=self.headers.get_all('Authorization',[])
            if self.path=='/v1/player/proof':p.require(len(auth)==1 and auth[0].startswith('Bearer '),'player session required')
            else:p.require(not auth,'grant uses only purpose-separated signed Wallet authority')
            lengths=self.headers.get_all('Content-Length',[])
            p.require(len(lengths)==1 and lengths[0].isascii() and lengths[0].isdigit() and len(lengths[0])<=6 and
                self.headers.get('Transfer-Encoding') is None and self.headers.get('Expect') is None and
                self.headers.get_all('Content-Type',[])==['application/json'],'invalid bounded Game framing')
            count=int(lengths[0]);p.require(1<=count<=65536,'Game request too large');self.reader.remaining=count;parts=[]
            while count:
                part=self.rfile.read(min(count,16384));p.require(bool(part),'truncated Game request');parts.append(part);count-=len(part)
            request=p.decode(b''.join(parts))
            with scope(self.deadline):
                if self.path=='/v1/player/proof':result={'ok':True,'result':self.server.grants.authority.proof(auth[0][7:],request)}
                else:result=self.server.grants.dispatch(request,deadline=self.deadline)
            self.respond(200,result)
        except (ValueError,PermissionError):self.respond(400,error('rejected','Game request rejected'))
        except Exception:self.respond(503,error('unavailable','Game outcome unresolved; retain original request'))

class GameExchangeServer(_TLSWalletListener):
    managed_contracts=True
    def __init__(self,address,grants,*,timeout=3,cert_file=None,key_file=None):
        p.require(address[0]=='127.0.0.1' and type(address[1]) is int and 0<=address[1]<=65535,'loopback Game listener required')
        p.require(type(timeout) in (int,float) and .1<=timeout<=3,'bounded Game listener deadline required')
        self.grants=grants;self.request_timeout=timeout;self.slots=threading.BoundedSemaphore(MAX_SLOTS);self.connection_deadlines={}
        self.context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);self.context.minimum_version=ssl.TLSVersion.TLSv1_2
        self.context.load_cert_chain(str(cert_file or FIXTURES/'development-ca.pem'),str(key_file or FIXTURES/'PUBLIC-FIXTURE-KEY.pem'))
        super().__init__(address,GameHandler)
