"""Strict, synthetic-only Wallet -> Game purchase contract.

This contract does not widen GX00 connection scopes. Each purchase requires a
new, exact Wallet owner assertion and a dedicated approval receipt. Money and
game assets have separate journals; no reverse/mint/settlement API exists.
"""
from dataclasses import dataclass
from types import MappingProxyType

from . import protocol as p
from wallet_auth import protocol as auth

POLICY='rock-game-purchase-public-fixture/1'
TERMS='rock-game-purchase-synthetic/1'
MAX_TOTAL=10000
MAX_ROWS=10000
SCHEMA_VERSION=1
ACCOUNTS=('GAME_HOLD','GAME_PURCHASES','GAME_FEES')
DOMAINS={
    'quote':b'RockGameExchangeQuote-v1\0',
    'approval':b'RockGameExchangeApprovalReceipt-v1\0',
    'apply':b'RockGameGrantApply-v1\0',
    'reject':b'RockGameGrantReject-v1\0',
    'status':b'RockGameGrantStatus-v1\0',
    'terminal':b'RockGameGrantReceipt-v1\0',
}
PURPOSES={kind:'game.exchange.'+kind for kind in DOMAINS}
SIGNATURE_FIELDS={'algorithm','credential_id','credential_revision','signature'}
OWNER_FIELDS={
    'game.sandbox.credit':{'key','amount_minor'},
    'game.exchange.quote':{'key','connection_id','exchange_id','principal_minor'},
    'game.exchange.approval.begin':{'key','quote_id'},
    'game.exchange.approve':{'key','attempt_id','quote_sha256','credential'},
    'game.exchange.status':{'connection_id','exchange_id'},
    'game.exchange.list':{'limit','after'},
    'game.exchange.cancel':{'key','connection_id','exchange_id'},
    'game.exchange.reconcile':{'key','connection_id','exchange_id'},
}
AUTHOR_FIELDS={
    'exchange.quote':{'key','connection_id','exchange_id','principal_minor'},
    'exchange.status':{'connection_id','exchange_id'},
}
BINDING_FIELDS={'wallet_authority_id','issuer_ledger_alias','writer_epoch','game_authority_id','game_id','player_id',
    'connection_id','connection_generation','exchange_id','quote_id','quote_version','source_asset','source_scale',
    'destination_asset','destination_scale','asset_class','principal_minor','game_fee_minor','external_cost_minor',
    'total_minor','units','numerator','denominator','rounding','policy','terms','issued_at','expires_at'}


def amounts(principal):
    p.integer(principal,10,9990)
    p.require(principal%10==0,'fixture principal must be an exact multiple of 10 cents')
    return {'principal_minor':principal,'game_fee_minor':3,'external_cost_minor':0,
            'total_minor':principal+3,'units':principal//10}


def request(value,*,author=False):
    p.canonical(value)
    p.require(type(value) is dict and type(value.get('v')) is int and value['v']==1,
              'exchange protocol version 1 required')
    options=AUTHOR_FIELDS if author else OWNER_FIELDS
    p.require(type(value.get('op')) is str and value['op'] in options,'unsupported exchange operation')
    p.fields(value,{'v','op'}|options[value['op']])
    for name in ('key','exchange_id'):
        if name in value:p.identifier(value[name],128)
    for name in ('connection_id','quote_id','attempt_id'):
        if name in value:p.uuid_value(value[name])
    if 'principal_minor' in value:amounts(value['principal_minor'])
    if value['op']=='game.sandbox.credit':p.require(type(value['amount_minor']) is int and value['amount_minor']==10000,'explicit public fixture credit is exactly 10000 cents')
    if 'quote_sha256' in value:p.digest(value['quote_sha256'])
    if 'credential' in value:p.require(type(value['credential']) is dict,'owner credential required')
    if 'limit' in value:p.integer(value['limit'],1,50)
    if 'after' in value:
        p.require(value['after'] is None or type(value['after']) is str,'nullable bounded exchange cursor')
        if value['after'] is not None:p.uuid_value(value['after'])
    return value


def binding(value):
    p.fields(value,BINDING_FIELDS)
    for name in ('wallet_authority_id','issuer_ledger_alias','connection_id','quote_id'):p.uuid_value(value[name])
    for name in ('game_authority_id','game_id','player_id','exchange_id'):p.identifier(value[name],128)
    p.integer(value['writer_epoch'],1);p.integer(value['connection_generation']);p.integer(value['quote_version'],1)
    p.require((value['game_authority_id'],value['game_id'],value['destination_asset']) in
        {('public-game-authority-a','public-game-a','COIN_A'),('public-game-authority-b','public-game-b','COIN_B')},
        'only explicitly registered public synthetic assets supported')
    expected={'source_asset':'synthetic:usd','source_scale':2,'destination_scale':0,'asset_class':'PURCHASED',
        'numerator':1,'denominator':10,'rounding':'REJECT_REMAINDER','policy':POLICY,'terms':TERMS}
    p.require(all(type(value[k]) is type(v) and value[k]==v for k,v in expected.items()),'unsupported synthetic purchase policy')
    expected=amounts(value['principal_minor'])
    p.require(all(type(value[k]) is int and value[k]==v for k,v in expected.items()),'amount, fee, total or units mismatch')
    p.integer(value['issued_at'],1);p.integer(value['expires_at'],value['issued_at']+1,value['issued_at']+120)
    p.canonical(value);return value


def binding_digest(value):binding(value);return p.hash_object(b'RockGameExchangeBinding-v1\0',value)
def quote_digest(value):quote(value);return p.hash_object(DOMAINS['quote'],value)
def approval_digest(value):approval(value);return p.hash_object(DOMAINS['approval'],value)
def command_digest(value):command(value);return p.hash_object(DOMAINS['apply'],value)
def request_digest(value,*,author=False):request(value,author=author);return p.hash_object(b'RockGameExchangeRequest-v1\0',value)


def common(value,schema):
    p.common(value,schema);p.signature_fields(value)
    p.require(value.get('simulation_only') is True,'synthetic receipt marker required')


def quote(value):
    p.fields(value,{'schema','environment','binding','binding_sha256','owner_ref','account_id','simulation_only'}|SIGNATURE_FIELDS)
    common(value,'rock-game-exchange-quote/1');binding(value['binding'])
    p.require(value['binding_sha256']==binding_digest(value['binding']),'quote binding digest mismatch')
    p.identifier(value['owner_ref']);p.identifier(value['account_id'])
    return value


def intent(value):
    p.fields(value,{'schema','environment','attempt_id','quote','quote_sha256','device_ref','device_credential_revision',
                    'credential_id','issued_at','expires_at','options','simulation_only'})
    p.common(value,'rock-game-exchange-approval-intent/1');p.require(value['simulation_only'] is True,'synthetic intent required')
    p.uuid_value(value['attempt_id']);quote(value['quote'])
    p.require(value['quote_sha256']==quote_digest(value['quote']),'intent quote digest mismatch')
    p.identifier(value['device_ref']);p.integer(value['device_credential_revision'],1)
    p.unb64(value['credential_id'],1,1023)
    p.integer(value['issued_at'],1);p.integer(value['expires_at'],value['issued_at']+1,value['issued_at']+120)
    p.require(value['expires_at']<=value['quote']['binding']['expires_at'],'approval exceeds quote lifetime')
    options=value['options'];p.fields(options,{'schema_version','device_ref','purpose','publicKey'})
    p.require(type(options['schema_version']) is int and options['schema_version']==1 and
        options['device_ref']==value['device_ref'] and options['purpose']=='wallet.game.exchange','dedicated exchange ceremony required')
    public=options['publicKey'];p.fields(public,{'challenge','timeout','rpId','allowCredentials','userVerification'})
    p.unb64(public['challenge'],32,32)
    p.require(public['rpId']==auth.RP_ID and public['userVerification']=='required' and
        public['allowCredentials']==[{'type':'public-key','id':value['credential_id']}] and
        type(public['timeout']) is int and public['timeout']==(value['expires_at']-value['issued_at'])*1000,'approval options mismatch')
    return value


def approval(value):
    p.fields(value,{'schema','environment','attempt_id','quote_id','binding_sha256','quote_sha256','device_ref',
        'device_credential_revision','owner_credential_id','sign_count','request_sha256','decision','reason','hold_id',
        'outbox_id','committed_at','simulation_only'}|SIGNATURE_FIELDS)
    common(value,'rock-game-exchange-approval-receipt/1')
    for name in ('attempt_id','quote_id'):p.uuid_value(value[name])
    for name in ('binding_sha256','quote_sha256','request_sha256'):p.digest(value[name])
    p.identifier(value['device_ref']);p.unb64(value['owner_credential_id'],1,1023)
    p.integer(value['device_credential_revision'],1);p.integer(value['sign_count'],1,4294967295);p.integer(value['committed_at'],1)
    if value['decision']=='APPROVED':
        p.require(value['reason'] is None,'approved exchange cannot have denial reason')
        p.uuid_value(value['hold_id']);p.uuid_value(value['outbox_id'])
    else:
        p.require(value['decision']=='DENIED' and value['reason'] in ('INSUFFICIENT_FUNDS','QUOTE_EXPIRED','QUOTE_SUPERSEDED','CONNECTION_INACTIVE'),
                  'unknown permanent approval decision')
        p.require(value['hold_id'] is None and value['outbox_id'] is None,'denied exchange cannot reserve funds')
    return value


def command(value):
    p.fields(value,{'schema','environment','operation','command_id','key','binding','binding_sha256','quote_sha256',
                    'approval_sha256','issued_at','simulation_only'}|SIGNATURE_FIELDS)
    common(value,'rock-game-grant-apply/1')
    p.require(value['operation']=='grant.apply','apply operation required')
    p.uuid_value(value['command_id']);p.identifier(value['key']);binding(value['binding'])
    p.require(value['binding_sha256']==binding_digest(value['binding']),'command binding digest mismatch')
    for name in ('quote_sha256','approval_sha256'):p.digest(value[name])
    p.integer(value['issued_at'],value['binding']['issued_at'])
    return value


def wrapper(value,kind):
    p.fields(value,{'schema','environment','operation','apply','apply_sha256','current_epoch','issued_at','simulation_only'}|SIGNATURE_FIELDS)
    common(value,'rock-game-grant-'+kind+'/1');command(value['apply'])
    p.require(value['operation']=='grant.'+('reject_if_unapplied' if kind=='reject' else 'status'),'wrapper operation mismatch')
    p.require(value['apply_sha256']==command_digest(value['apply']),'wrapper original bytes mismatch')
    p.integer(value['current_epoch'],value['apply']['binding']['writer_epoch']);p.integer(value['issued_at'],value['apply']['issued_at'])
    return value


def terminal(value):
    p.fields(value,{'schema','environment','binding','binding_sha256','quote_sha256','approval_sha256','apply_sha256',
        'terminal_state','decision_id','decision_revision','decided_at','simulation_only'}|SIGNATURE_FIELDS)
    common(value,'rock-game-grant-receipt/1');binding(value['binding'])
    p.require(value['binding_sha256']==binding_digest(value['binding']),'terminal binding mismatch')
    for name in ('quote_sha256','approval_sha256','apply_sha256'):p.digest(value[name])
    p.require(value['terminal_state'] in ('APPLIED','REJECTED'),'terminal decision required')
    p.uuid_value(value['decision_id']);p.integer(value['decision_revision'],1,1);p.integer(value['decided_at'],value['binding']['issued_at'])
    return value


def signature_payload(kind,value):
    p.require(kind in DOMAINS,'unsupported exchange signing purpose')
    if kind in ('status','reject'):wrapper(value,kind)
    else:{'quote':quote,'approval':approval,'apply':command,'terminal':terminal}[kind](value)
    return DOMAINS[kind]+p.canonical({k:v for k,v in value.items() if k!='signature'})


class KeyRegistry:
    """Fixed trusted exchange key snapshot; no wire key import or rotation."""
    def __init__(self,records):
        p.require(type(records) is tuple and 1<=len(records)<=32,'bounded trusted exchange key tuple required')
        mapping={};material=set()
        for record in records:
            p.require(type(record) is p.KeyRecord and record.purpose in PURPOSES.values(),'exchange purpose key required')
            p.identifier(record.key_id);p.identifier(record.issuer)
            p.require(record.revision==1 and record.not_before==1 and record.not_after==p.MAX_INT and
                      record.retired_at is None and record.revoked_at is None,'only fixed public fixture key policy implemented')
            auth._validate_public_point(record.public_key)
            p.require(record.public_key not in material and record.public_key.hex()!=p.PUBLIC_TEST_KEY,'purpose keys cannot share material')
            key=(record.issuer,record.purpose,record.key_id,record.revision)
            p.require(key not in mapping,'duplicate exchange key');mapping[key]=record;material.add(record.public_key)
        self.records=MappingProxyType(mapping)

    def verify(self,kind,value,issuer):
        payload=signature_payload(kind,value)
        record=self.records.get((issuer,PURPOSES[kind],value['credential_id'],value['credential_revision']))
        p.require(record is not None,'unknown exchange signing key or purpose')
        try:auth._signature(record.public_key,p.unb64(value['signature'],64,64),payload)
        except auth.AuthError as exc:raise p.ProtocolError('exchange signature rejected') from exc
        except auth.AuthUnavailable as exc:raise p.VerificationUnavailable('exchange signature verification unavailable') from exc
        return record


def match_terminal(value,apply,keys):
    terminal(value);command(apply)
    keys.verify('terminal',value,apply['binding']['game_authority_id'])
    p.require(value['binding']==apply['binding'] and value['binding_sha256']==apply['binding_sha256'] and
        value['quote_sha256']==apply['quote_sha256'] and value['approval_sha256']==apply['approval_sha256'] and
        value['apply_sha256']==command_digest(apply),'terminal receipt belongs to a different exchange')
    return value


def author_projection(value):
    """An authenticated current projection; private owner/account are omitted."""
    quote(value)
    return {'schema':'rock-game-exchange-author-quote/1','quote_id':value['binding']['quote_id'],
        'binding':value['binding'],'quote_sha256':quote_digest(value),'simulation_only':True}
