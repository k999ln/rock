"""Public synthetic host-only signing keys, strictly separated by purpose."""
from . import protocol as p
from . import exchange_protocol as x
from .fixture import _crypto


class PublicExchangeSigner:
    def __init__(self,issuer,kind):
        p.identifier(issuer);p.require(kind in x.PURPOSES,'fixed exchange signing purpose required')
        self.issuer,self.kind=issuer,kind
        self.label='exchange:'+kind+':'+issuer
        self.key_id='public-exchange-'+kind+'-'+issuer
        self.record=p.KeyRecord(self.key_id,1,x.PURPOSES[kind],issuer,_crypto(self.label),1,p.MAX_INT,None,None)

    def fields(self):
        return {'algorithm':'Ed25519','credential_id':self.key_id,'credential_revision':1,'signature':p.b64(bytes(64))}

    def sign(self,value):
        p.require(value['credential_id']==self.key_id and value['credential_revision']==1,'fixed exchange signer identity required')
        payload=x.signature_payload(self.kind,value)
        if self.kind in ('quote','apply'):
            p.require(value['binding']['wallet_authority_id']==self.issuer,'Wallet signing issuer mismatch')
        if self.kind=='terminal':
            p.require(value['binding']['game_authority_id']==self.issuer,'Game signing issuer mismatch')
        if self.kind in ('reject','status'):
            p.require(value['apply']['binding']['wallet_authority_id']==self.issuer,'reconciliation signing issuer mismatch')
        result=p.decode(p.canonical(value));result['signature']=p.b64(_crypto(self.label,payload));return result
