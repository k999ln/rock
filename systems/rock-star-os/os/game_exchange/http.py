"""Pinned bounded real TLS transport for public Game fixture services."""
import hashlib
import http.client
import ssl
import time
from urllib.parse import urlsplit
from wallet_backend.client import read_protected,BackendUnavailable
from runner.transport import DeadlineConnection
from . import protocol as p

class GameTransport:
    def __init__(self,origin,ca_file,game_id,*,token=None,endpoint='/v1/grant',timeout=3):
        u=urlsplit(origin)
        p.require(u.scheme=='https' and u.hostname in ('127.0.0.1','localhost','10.0.2.2') and
            not u.username and not u.password and u.path in ('','/') and not u.query and not u.fragment,'fixed owned Game TLS origin required')
        p.identifier(game_id);p.require(endpoint in ('/v1/grant','/v1/player/proof','/v1/game-exchange'),'fixed Game endpoint required')
        p.require(type(timeout) in (int,float) and .05<=timeout<=3,'bounded Game deadline required')
        self.host,self.port,self.game_id,self.token,self.endpoint,self.timeout=u.hostname,u.port or 443,game_id,token,endpoint,timeout
        ca=read_protected(ca_file,65536);self.context=ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        self.context.minimum_version=ssl.TLSVersion.TLSv1_2;self.context.load_verify_locations(cadata=ca.decode('ascii'))
        self.context.check_hostname=True;self.context.verify_mode=ssl.CERT_REQUIRED
        self.fingerprint=hashlib.sha256(p.canonical([origin,game_id,endpoint,hashlib.sha256(ca).hexdigest(),
            hashlib.sha256((token or '').encode()).hexdigest()])).hexdigest()

    def exchange(self,request,*,deadline=None):
        raw=p.canonical(request);deadline=min(deadline or float('inf'),time.monotonic()+self.timeout)
        remaining=deadline-time.monotonic()
        if remaining<=0:raise BackendUnavailable('Game request deadline elapsed')
        connection=http.client.HTTPSConnection(self.host,self.port,context=self.context,timeout=remaining);wrapped=None
        try:
            connection.connect();wrapped=DeadlineConnection(connection.sock,max(.001,deadline-time.monotonic()));connection.sock=wrapped
            headers={'Content-Type':'application/json','Connection':'close','X-Rock-Game':self.game_id}
            if self.token is not None:headers['Authorization']='Bearer '+self.token
            connection.request('POST',self.endpoint,raw,headers=headers);response=connection.getresponse()
            p.require(response.headers.get_all('X-Rock-Game',[])==[self.game_id],'Game identity acknowledgement mismatch')
            lengths=response.headers.get_all('Content-Length',[])
            p.require(len(lengths)==1 and lengths[0].isascii() and lengths[0].isdigit() and len(lengths[0])<=6 and
                response.headers.get('Transfer-Encoding') is None and response.headers.get_all('Content-Type',[])==['application/json'],
                'ambiguous Game response framing')
            count=int(lengths[0]);p.require(1<=count<=65536,'bounded Game response required');parts=[]
            while count:
                part=response.read1(min(count,16384));p.require(bool(part),'truncated Game response');parts.append(part);count-=len(part)
            value=p.decode(b''.join(parts));p.require(type(value) is dict and type(value.get('ok')) is bool,'Game response envelope required')
            if response.status not in (200,400,401,403):raise BackendUnavailable('Game outcome unavailable')
            return value
        except (OSError,TimeoutError,http.client.HTTPException,ValueError) as exc:
            raise BackendUnavailable('Game outcome unknown; retain original request') from exc
        finally:
            connection.close()
            if wrapped is not None:wrapped.close()
