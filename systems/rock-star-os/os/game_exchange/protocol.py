"""GX00 synthetic connection wire contract, pure validation and verification.

No listener, credential authentication, DB transaction, subject registry, asset
API or exchange is installed by this module. Internal contexts are supplied by
trusted managed admission; constructing a context is not authentication.
"""
import base64
from dataclasses import dataclass
import hashlib
import json
import re
from types import MappingProxyType
import unicodedata
import uuid

from wallet_auth import protocol as auth
from blackberryrock.packages import PUBLIC_TEST_KEY

MAX_BYTES=65536
MAX_INT=2**53-1
TERMS='rock-game-connection-synthetic/1'
RP_ID=auth.RP_ID
SCOPES=('connection:read','connection:revoke')
DOMAINS={'proof':b'RockGameConnectionProof-v1\0','shared':b'RockGameConnectionReceipt-v1\0',
         'cursor':b'RockGameConnectionCursor-v1\0'}
PURPOSES={'proof':'game.connection.proof','shared':'wallet.connection.receipt','cursor':'wallet.connection.cursor'}


class ProtocolError(ValueError):pass
class FeatureDisabled(ProtocolError):pass
class VerificationUnavailable(RuntimeError):pass


def require(value,message='invalid connection contract'):
    if not value:raise ProtocolError(message)


def fields(value,names):require(type(value) is dict and set(value)==set(names),'missing or unknown connection field')
def integer(value,minimum=0,maximum=MAX_INT):
    require(type(value) is int and minimum<=value<=maximum,'invalid exact integer');return value

def identifier(value,maximum=160):
    require(type(value) is str and 1<=len(value)<=maximum and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:@-]*',value),
            'invalid bounded opaque identifier');return value

def uuid_value(value):
    try:require(type(value) is str and str(uuid.UUID(value))==value,'noncanonical UUID')
    except (ValueError,AttributeError,TypeError) as exc:raise ProtocolError('noncanonical UUID') from exc
    return value

def text(value,maximum=160):
    require(type(value) is str and 1<=len(value)<=maximum and unicodedata.normalize('NFC',value)==value and
            all(unicodedata.category(c) not in ('Cc','Cf','Cs') for c in value),'unsafe or non-NFC display text')
    require(len(value.encode('utf-8'))<=maximum*4,'display byte bound');return value

def digest(value):require(type(value) is str and re.fullmatch('[a-f0-9]{64}',value),'invalid SHA256');return value

def b64(raw):return base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=')
def unb64(value,minimum,maximum):
    require(type(value) is str and len(value)<=((maximum+2)//3)*4 and re.fullmatch('[A-Za-z0-9_-]*',value),'invalid base64url')
    try:raw=base64.b64decode(value+'='*(-len(value)%4),altchars=b'-_',validate=True)
    except ValueError as exc:raise ProtocolError('invalid base64url') from exc
    require(minimum<=len(raw)<=maximum and b64(raw)==value,'noncanonical or unbounded base64url');return raw


def canonical(value):
    budget=[2048]
    def visit(item,depth=0):
        budget[0]-=1;require(depth<=12 and budget[0]>=0,'JSON structural bound')
        if type(item) is dict:
            for key,child in item.items():
                require(type(key) is str and key.isascii() and len(key)<=80,'ASCII schema keys required');visit(child,depth+1)
        elif type(item) is list:
            for child in item:visit(child,depth+1)
        elif type(item) is int:integer(item)
        elif type(item) is str:
            require(len(item)<=MAX_BYTES and not any(0xD800<=ord(c)<=0xDFFF for c in item),'invalid UTF8 string')
        else:require(item is None or type(item) is bool,'floats and non-JSON values forbidden')
    try:
        visit(value);raw=json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode('utf-8')
        require(len(raw)<=MAX_BYTES,'JSON byte bound');return raw
    except (UnicodeError,RecursionError,TypeError,ValueError) as exc:raise ProtocolError('invalid bounded canonical JSON') from exc


def decode(raw):
    require(type(raw) is bytes and 1<=len(raw)<=MAX_BYTES and not raw.startswith(b'\xef\xbb\xbf'),'strict UTF8 JSON bytes required')
    def pairs(items):
        result={}
        for key,value in items:require(key not in result,'duplicate JSON field');result[key]=value
        return result
    def number(raw):require(raw=='0' or raw[0]!='-','negative or nonminimal integer');return integer(int(raw))
    def reject(_):raise ProtocolError('floating/nonfinite JSON numbers forbidden')
    try:result=json.loads(raw.decode('utf-8'),object_pairs_hook=pairs,parse_int=number,parse_float=reject,parse_constant=reject)
    except (ValueError,UnicodeError,RecursionError) as exc:raise ProtocolError('invalid strict JSON') from exc
    canonical(result);require(type(result) is dict,'object required');return result


def hash_object(domain,value):return hashlib.sha256(domain+canonical(value)).hexdigest()
def validate_scopes(value):
    require(type(value) is list and 1<=len(value)<=len(SCOPES) and all(type(v) is str for v in value) and
            value==sorted(set(value)) and set(value)<=set(SCOPES) and 'connection:read' in value,'invalid or unavailable scope set')
    return value

def common(value,schema):
    canonical(value);require(value['schema']==schema and value['environment']=='synthetic','synthetic schema required')

def signature_fields(value):
    require(value['algorithm']=='Ed25519','only Ed25519 supported')
    identifier(value['credential_id']);integer(value['credential_revision'],1);unb64(value['signature'],64,64)


@dataclass(frozen=True,slots=True)
class KeyRecord:
    key_id:str
    revision:int
    purpose:str
    issuer:str
    public_key:bytes
    not_before:int
    not_after:int
    retired_at:int|None
    revoked_at:int|None


class KeyRegistry:
    """Immutable trusted snapshot, not a request key import or registry restore API."""
    def __init__(self,records):
        require(type(records) is tuple and 1<=len(records)<=64,'bounded explicit trusted key tuple')
        mapping={};material=set()
        for record in records:
            require(type(record) is KeyRecord,'exact key record required')
            identifier(record.key_id);identifier(record.issuer);integer(record.revision,1)
            require(record.purpose in PURPOSES.values(),'unsupported credential purpose')
            integer(record.not_before,1);integer(record.not_after,record.not_before+1)
            for when in (record.retired_at,record.revoked_at):
                if when is not None:integer(when,record.not_before)
            require(type(record.public_key) is bytes and len(record.public_key)==32 and record.public_key not in material and record.public_key.hex()!=PUBLIC_TEST_KEY,
                    'known Tool/Registry fixture keys cannot be admitted; keys cannot be shared across identities or purposes')
            try:auth._validate_public_point(record.public_key)
            except auth.AuthError as exc:raise ProtocolError('invalid public key') from exc
            identity=(record.issuer,record.purpose,record.key_id,record.revision)
            require(identity not in mapping,'duplicate key identity');mapping[identity]=record;material.add(record.public_key)
        self.records=MappingProxyType(mapping)

    def resolve(self,issuer,purpose,key_id,revision,*,signed_at,now,current):
        integer(now,1);integer(signed_at,1)
        record=self.records.get((issuer,purpose,key_id,revision))
        require(record is not None and record.revoked_at is None and record.not_before<=signed_at<record.not_after and signed_at<=now,
                'untrusted, revoked or invalid-time signing key')
        require(record.retired_at is None or signed_at<record.retired_at,'signature postdates key retirement')
        if current:require(record.retired_at is None and record.not_before<=now<record.not_after,'current signing authorization required')
        return record


@dataclass(frozen=True,slots=True)
class GameRecord:
    author_id:str
    game_authority_id:str
    game_id:str
    game_name:str
    revision:int
    scopes:tuple[str,...]


@dataclass(frozen=True,slots=True)
class OwnerContext:
    wallet_authority_id:str
    owner_ref:str
    account_id:str
    device_ref:str
    credential_revision:int


@dataclass(frozen=True,slots=True)
class GamePrincipal:
    author_id:str
    game_authority_id:str
    game_id:str
    credential_revision:int
    scopes:tuple[str,...]
    expires_at:int
    revoked:bool


@dataclass(frozen=True,slots=True)
class ConnectionHead:
    wallet_authority_id:str
    game_authority_id:str
    game_id:str
    connection_id:str
    revocation_generation:int
    state:str
    receipt_sha256:str


def current_head(shared,current):
    require(type(current) is ConnectionHead,'current admitted connection index head required')
    uuid_value(current.wallet_authority_id);uuid_value(current.connection_id)
    identifier(current.game_authority_id);identifier(current.game_id);integer(current.revocation_generation);digest(current.receipt_sha256)
    public=shared['publication']
    require(all(getattr(current,key)==public[key] for key in ('wallet_authority_id','game_authority_id','game_id','connection_id','revocation_generation','state')) and
            current.receipt_sha256==hash_object(b'RockGameSharedReceipt-v1\0',shared),'historical receipt is not the current connection head')


def game_record(game):
    require(type(game) is GameRecord,'trusted game registry descriptor required')
    for value in (game.author_id,game.game_authority_id,game.game_id):identifier(value)
    text(game.game_name);integer(game.revision,1);require(type(game.scopes) is tuple,'immutable game scopes required');validate_scopes(list(game.scopes))


def owner_context(owner):
    require(type(owner) is OwnerContext,'authenticated internal owner context required')
    uuid_value(owner.wallet_authority_id);identifier(owner.account_id);identifier(owner.owner_ref);identifier(owner.device_ref);integer(owner.credential_revision,1)


PROOF_FIELDS={'schema','environment','game_authority_id','game_id','game_revision','player_id','player_display',
    'player_display_revision','audience','nonce','issued_at','expires_at','requested_scopes','algorithm','credential_id','credential_revision','signature'}

def validate_proof(value):
    fields(value,PROOF_FIELDS);common(value,'rock-game-connection-proof/1');signature_fields(value)
    for key in ('game_authority_id','game_id','player_id'):identifier(value[key])
    text(value['player_display']);integer(value['player_display_revision'],1);integer(value['game_revision'],1)
    uuid_value(value['audience']);unb64(value['nonce'],32,32);validate_scopes(value['requested_scopes'])
    integer(value['issued_at'],1);integer(value['expires_at'],value['issued_at']+1,min(MAX_INT,value['issued_at']+120));return value


def signature_payload(kind,value):
    require(kind in DOMAINS,'unknown signing domain')
    {'proof':validate_proof,'shared':validate_shared,'cursor':validate_cursor}[kind](value)
    # Remove ONLY this schema's top-level signature, never recursive fields.
    return DOMAINS[kind]+canonical({key:item for key,item in value.items() if key!='signature'})


def verify_signature(kind,value,keys,*,issuer,signed_at,now,current):
    require(type(keys) is KeyRegistry,'protected registry snapshot required')
    payload=signature_payload(kind,value)
    record=keys.resolve(issuer,PURPOSES[kind],value['credential_id'],value['credential_revision'],signed_at=signed_at,now=now,current=current)
    try:auth._signature(record.public_key,unb64(value['signature'],64,64),payload)
    except auth.AuthError as exc:raise ProtocolError('connection signature rejected') from exc
    except auth.AuthUnavailable as exc:raise VerificationUnavailable('connection signature verification unavailable') from exc


def verify_proof(proof,keys,game,*,audience,now):
    validate_proof(proof);game_record(game);uuid_value(audience);integer(now,1)
    require((proof['game_authority_id'],proof['game_id'],proof['game_revision'])==(game.game_authority_id,game.game_id,game.revision) and
            proof['audience']==audience and set(proof['requested_scopes'])<=set(game.scopes),'proof registry/audience mismatch')
    require(proof['issued_at']<=now<proof['expires_at'],'proof expired or from the future')
    verify_signature('proof',proof,keys,issuer=game.game_authority_id,signed_at=proof['issued_at'],now=now,current=True)
    return decode(canonical(proof))


BINDING_FIELDS={'schema','environment','wallet_authority_id','owner_ref','account_id','device_ref','credential_revision',
 'author_id','game_authority_id','game_id','game_revision','game_name','player_id','player_display','player_display_revision',
 'proof_sha256','proof_nonce','intent_id','connection_id','scopes','terms_version','created_at','intent_expires_at','connection_expires_at'}

def validate_binding(value):
    fields(value,BINDING_FIELDS);common(value,'rock-game-connection-binding/1')
    for key in ('wallet_authority_id','intent_id','connection_id'):uuid_value(value[key])
    for key in ('account_id','owner_ref','device_ref','author_id','game_authority_id','game_id','player_id'):identifier(value[key])
    for key in ('credential_revision','game_revision','player_display_revision'):integer(value[key],1)
    text(value['game_name']);text(value['player_display']);digest(value['proof_sha256']);unb64(value['proof_nonce'],32,32);validate_scopes(value['scopes'])
    require(value['terms_version']==TERMS,'unsupported connection terms');integer(value['created_at'],1)
    integer(value['intent_expires_at'],value['created_at']+1,min(MAX_INT,value['created_at']+120))
    integer(value['connection_expires_at'],value['intent_expires_at'],min(MAX_INT,value['created_at']+86400));return value


def proof_digest(proof):validate_proof(proof);return hash_object(b'RockGameProofDigest-v1\0',proof)
def binding_digest(binding):validate_binding(binding);return hash_object(b'RockGameConnectionBinding-v1\0',binding)


def make_binding(proof,game,owner,*,intent_id,connection_id,scopes: list,terms_version,now,connection_expires_at):
    # Caller must first verify_proof under current protected registry. This pure
    # constructor is not authentication or nonce/subject reservation.
    validate_proof(proof);game_record(game);owner_context(owner);integer(now,1)
    require((proof['game_authority_id'],proof['game_id'],proof['game_revision'],proof['audience'])==
            (game.game_authority_id,game.game_id,game.revision,owner.wallet_authority_id),'proof context mismatch')
    validate_scopes(scopes)
    require(set(scopes)<=set(proof['requested_scopes'])&set(game.scopes),'scope expansion refused')
    value={'schema':'rock-game-connection-binding/1','environment':'synthetic',
        **{name:getattr(owner,name) for name in ('wallet_authority_id','owner_ref','account_id','device_ref','credential_revision')},
        'author_id':game.author_id,'game_authority_id':game.game_authority_id,'game_id':game.game_id,'game_revision':game.revision,'game_name':game.game_name,
        **{name:proof[name] for name in ('player_id','player_display','player_display_revision')},
        'proof_sha256':proof_digest(proof),'proof_nonce':proof['nonce'],'intent_id':intent_id,'connection_id':connection_id,
        'scopes':scopes,'terms_version':terms_version,'created_at':now,'intent_expires_at':proof['expires_at'],
        'connection_expires_at':connection_expires_at}
    validate_binding(value);return decode(canonical(value))


def reservation_keys(binding):
    validate_binding(binding)
    return ((binding['game_authority_id'],binding['proof_nonce']),
            (binding['game_authority_id'],binding['game_id'],binding['player_id']))


def match_reservation(saved,binding):
    """Match a current protected index row; does not reserve or transition it.

    Both unique keys need atomic durable enforcement by the future shared
    registry. TTL, connection revocation and missing replies never delete them.
    A new intent/reconnection requires a separate supported resolution protocol.
    """
    fields(saved,{'schema','environment','state','binding','binding_sha256'})
    common(saved,'rock-game-subject-reservation/1');validate_binding(binding);validate_binding(saved['binding'])
    require(saved['state'] in ('RESERVED','WALLET_CONSENT_COMMITTED','ACTIVE','REVOKED') and
            saved['binding_sha256']==binding_digest(saved['binding']) and saved['binding']==binding and
            saved['binding_sha256']==binding_digest(binding),'subject or nonce belongs to a different immutable intent')


def receipt_common(value,op):
    require(value['operation']==op,'receipt operation mismatch');identifier(value['key'],128);digest(value['request_sha256']);uuid_value(value['receipt_id'])
    require(value['simulation_only'] is True,'simulation marker required')

def validate_intent(value):
    fields(value,{'schema','environment','state','operation','key','request_sha256','receipt_id','binding','binding_sha256','challenge_id','options','simulation_only'})
    common(value,'rock-game-connection-intent/1');receipt_common(value,'game.connection.begin');binding=value['binding'];validate_binding(binding)
    require(value['state']=='AWAITING_OWNER_CONSENT' and value['binding_sha256']==binding_digest(binding),'intent state or binding mismatch');uuid_value(value['challenge_id'])
    options=value['options'];fields(options,{'schema_version','purpose','device_ref','publicKey'})
    require(type(options['schema_version']) is int and options['schema_version']==1 and options['purpose']=='wallet.game.connect' and
            options['device_ref']==binding['device_ref'],'game ceremony context mismatch')
    public=options['publicKey'];fields(public,{'challenge','timeout','rpId','allowCredentials','userVerification'})
    unb64(public['challenge'],32,32);integer(public['timeout'],1,(binding['intent_expires_at']-binding['created_at'])*1000)
    require(public['rpId']==RP_ID and public['userVerification']=='required','fixed Wallet ceremony required')
    allowed=public['allowCredentials'];require(type(allowed) is list and 1<=len(allowed)<=16,'bounded allowCredentials required');seen=set()
    for row in allowed:
        fields(row,{'type','id'});require(row['type']=='public-key','credential type required');unb64(row['id'],1,1023)
        require(row['id'] not in seen,'duplicate allowed credential');seen.add(row['id'])
    return value


def validate_consent(value):
    fields(value,{'schema','environment','operation','key','request_sha256','receipt_id','binding','binding_sha256','challenge_id',
                  'credential_id','assertion_sha256','credential_sign_count','committed_at','decision','simulation_only'})
    common(value,'rock-game-owner-consent/1');receipt_common(value,'game.connection.approve');validate_binding(value['binding'])
    require(value['binding_sha256']==binding_digest(value['binding']) and value['decision']=='APPROVED','consent binding or decision mismatch')
    uuid_value(value['challenge_id']);unb64(value['credential_id'],1,1023);digest(value['assertion_sha256']);integer(value['credential_sign_count'],0,2**32-1)
    integer(value['committed_at'],value['binding']['created_at'],value['binding']['intent_expires_at']-1);return value


def consent_digest(value):validate_consent(value);return hash_object(b'RockGameOwnerConsent-v1\0',value)

PUBLIC_FIELDS={'wallet_authority_id','game_authority_id','game_id','player_id','connection_id','scopes','terms_version','issued_at','expires_at',
               'revocation_generation','state','decided_at','binding_sha256','consent_sha256','simulation_only'}

def validate_publication(value):
    fields(value,PUBLIC_FIELDS)
    for key in ('wallet_authority_id','connection_id'):uuid_value(value[key])
    for key in ('game_authority_id','game_id','player_id'):identifier(value[key])
    validate_scopes(value['scopes']);require(value['terms_version']==TERMS and value['simulation_only'] is True,'invalid publication terms')
    integer(value['issued_at'],1);integer(value['expires_at'],value['issued_at']+1,min(MAX_INT,value['issued_at']+86400))
    integer(value['decided_at'],value['issued_at']);integer(value['revocation_generation'])
    require((value['state']=='ACTIVE' and value['revocation_generation']==0 and value['decided_at']==value['issued_at']) or
            (value['state']=='REVOKED' and value['revocation_generation']>=1),'invalid connection generation/state')
    digest(value['binding_sha256']);digest(value['consent_sha256']);return value


def publication(consent,*,receipt_id,key_id,key_revision):
    validate_consent(consent);binding=consent['binding']
    public={key:binding[key] for key in ('wallet_authority_id','game_authority_id','game_id','player_id','connection_id','scopes','terms_version')}
    public.update(issued_at=consent['committed_at'],expires_at=binding['connection_expires_at'],revocation_generation=0,state='ACTIVE',
                  decided_at=consent['committed_at'],binding_sha256=consent['binding_sha256'],consent_sha256=consent_digest(consent),simulation_only=True)
    value={'schema':'rock-game-connection-receipt/1','environment':'synthetic','operation':'connection.publish',
        'key':'publish:'+binding['connection_id']+':0','request_sha256':hash_object(b'RockGameConnectionPublication-v1\0',public),
        'receipt_id':receipt_id,'publication':public,'algorithm':'Ed25519','credential_id':key_id,'credential_revision':key_revision,'signature':b64(b'\0'*64)}
    validate_shared(value);return value


def validate_shared(value):
    fields(value,{'schema','environment','operation','key','request_sha256','receipt_id','publication','algorithm','credential_id','credential_revision','signature'})
    common(value,'rock-game-connection-receipt/1');signature_fields(value);public=value['publication'];validate_publication(public)
    require(value['operation']=='connection.publish' and value['key']=='publish:'+public['connection_id']+':'+str(public['revocation_generation']) and
            value['request_sha256']==hash_object(b'RockGameConnectionPublication-v1\0',public),'publication digest or key mismatch')
    uuid_value(value['receipt_id']);return value


def verify_shared(value,keys,*,now):
    validate_shared(value);public=value['publication']
    verify_signature('shared',value,keys,issuer=public['wallet_authority_id'],signed_at=public['decided_at'],now=now,current=False)
    return decode(canonical(value))


def match_consent(shared,consent):
    validate_shared(shared);validate_consent(consent)
    expected=publication(consent,receipt_id=shared['receipt_id'],key_id=shared['credential_id'],key_revision=shared['credential_revision'])['publication']
    actual=shared['publication']
    require(all(actual[key]==value for key,value in expected.items() if key not in ('state','revocation_generation','decided_at')),
            'shared receipt belongs to another owner consent')


def project_author(shared,keys,principal,*,game,current,now):
    value=verify_shared(shared,keys,now=now);current_head(value,current);game_record(game);public=value['publication']
    require(type(principal) is GamePrincipal and type(principal.revoked) is bool and not principal.revoked and
            type(principal.expires_at) is int and now<principal.expires_at and type(principal.credential_revision) is int and
            principal.credential_revision>=1 and type(principal.scopes) is tuple and all(type(scope) is str for scope in principal.scopes) and
            'connection:read' in principal.scopes and set(principal.scopes)<=set(game.scopes) and
            (principal.author_id,principal.game_authority_id,principal.game_id)==(game.author_id,game.game_authority_id,game.game_id) and
            (principal.game_authority_id,principal.game_id)==(public['game_authority_id'],public['game_id']),
            'current game connection authorization required')
    # author_id belongs to the trusted principal's protected game mapping; it
    # is never inferred from a request or used to select a Wallet directory.
    identifier(principal.author_id)
    state=public['state'] if public['state']=='REVOKED' or now<public['expires_at'] else 'EXPIRED'
    fields_to_share=('wallet_authority_id','game_authority_id','game_id','connection_id','revocation_generation','decided_at','expires_at')
    if state=='ACTIVE':fields_to_share+=('player_id','scopes','terms_version','issued_at')
    return {'schema':'rock-game-author-connection-view/1',**{key:public[key] for key in fields_to_share},
            'state':state,'as_of':now,'receipt_sha256':hash_object(b'RockGameSharedReceipt-v1\0',value),'simulation_only':True}


def project_owner(shared,consent,keys,owner,*,current,now):
    value=verify_shared(shared,keys,now=now);current_head(value,current);match_consent(value,consent);owner_context(owner);binding=consent['binding']
    require(all(getattr(owner,key)==binding[key] for key in ('wallet_authority_id','owner_ref','account_id')),'current owner binding required')
    state=value['publication']['state'] if value['publication']['state']=='REVOKED' or now<value['publication']['expires_at'] else 'EXPIRED'
    return {'schema':'rock-game-owner-connection-view/1','connection':value['publication'],'current_state':state,'as_of':now,'consent_receipt_id':consent['receipt_id'],
            'approved_device_ref':binding['device_ref'],'receipt_sha256':hash_object(b'RockGameSharedReceipt-v1\0',value),'simulation_only':True}


def exact_retry(saved,request):
    validate_owner_request(saved);validate_owner_request(request)
    require(canonical(saved)==canonical(request),'idempotency conflict; retain original unresolved request');return True


def admit_intent_action(intent,owner,action,*,now):
    validate_intent(intent);owner_context(owner);integer(now,1);binding=intent['binding']
    require(all(getattr(owner,key)==binding[key] for key in ('wallet_authority_id','owner_ref','account_id')),'intent belongs to another contract')
    if action in ('status','reconcile'):return
    if action!='approve':raise FeatureDisabled('pending intent transfer/cancel/reassignment is not implemented')
    require(owner.device_ref==binding['device_ref'] and owner.credential_revision==binding['credential_revision'] and
            binding['created_at']<=now<binding['intent_expires_at'],'fresh original-device approval required')


OWNER_OPERATIONS={'game.connection.begin':{'key','proof','scopes','terms_version','connection_expires_at'},
 'game.connection.approve':{'key','intent_id','challenge_id','binding_sha256','credential'},
 'game.connection.reconcile':{'key','intent_id'},'game.connection.status':{'connection_id'},
 'game.connection.list':{'limit','cursor'},'game.connection.revoke':{'key','connection_id'}}
GAME_OPERATIONS={'connection.status':{'connection_id'},'connection.revoke':{'key','connection_id'}}


def validate_owner_request(value):
    canonical(value);require(type(value) is dict and type(value.get('v')) is int and value['v']==1 and type(value.get('op')) is str,'invalid owner game envelope')
    op=value['op']
    if op not in OWNER_OPERATIONS:raise FeatureDisabled('owner game operation is not implemented by this contract')
    fields(value,{'v','op'}|OWNER_OPERATIONS[op])
    if 'key' in value:identifier(value['key'],128)
    for key in ('connection_id','intent_id','challenge_id'):
        if key in value:uuid_value(value[key])
    if op=='game.connection.begin':
        validate_proof(value['proof']);validate_scopes(value['scopes']);require(set(value['scopes'])<=set(value['proof']['requested_scopes']) and value['terms_version']==TERMS,'scope or terms mismatch')
        integer(value['connection_expires_at'],1)
    if op=='game.connection.approve':
        digest(value['binding_sha256'])
        try:auth._credential(value['credential'],False)
        except auth.AuthError as exc:raise ProtocolError('invalid assertion shape') from exc
    if op=='game.connection.list':
        integer(value['limit'],1,50)
        if value['cursor'] is not None:unb64(value['cursor'],1,4096)
    return value


def owner_request_digest(request):
    validate_owner_request(request);return hash_object(b'RockGameOwnerRequest-v1\0',request)


def match_begin_intent(intent,request,game,owner):
    """Join a saved receipt, request and trusted context; not proof authentication."""
    validate_intent(intent);validate_owner_request(request)
    require(request['op']=='game.connection.begin' and intent['key']==request['key'] and
            intent['request_sha256']==owner_request_digest(request),'begin receipt does not match its exact request')
    binding=intent['binding']
    expected=make_binding(request['proof'],game,owner,intent_id=binding['intent_id'],connection_id=binding['connection_id'],
        scopes=request['scopes'],terms_version=request['terms_version'],now=binding['created_at'],
        connection_expires_at=request['connection_expires_at'])
    require(binding==expected,'begin receipt proof or authenticated context mismatch')


def match_owner_consent(consent,intent,request):
    """Durable joins only; signature verification and atomic commit are separate."""
    validate_consent(consent);validate_intent(intent);validate_owner_request(request)
    require(request['op']=='game.connection.approve' and consent['binding']==intent['binding'] and
            consent['binding_sha256']==intent['binding_sha256']==request['binding_sha256'] and
            request['intent_id']==intent['binding']['intent_id'] and
            consent['challenge_id']==intent['challenge_id']==request['challenge_id'] and
            consent['key']==request['key'] and consent['request_sha256']==owner_request_digest(request) and
            consent['credential_id']==request['credential']['id'] and
            consent['assertion_sha256']==hash_object(b'RockGameOwnerAssertion-v1\0',request['credential']),
            'consent receipt does not match the immutable owner approval')
    require(consent['credential_id'] in {row['id'] for row in intent['options']['publicKey']['allowCredentials']},
            'consent uses another saved challenge credential')
    try:counter,_,_=auth._auth_data(auth.b64decode(request['credential']['response']['authenticatorData'],37,37),False)
    except auth.AuthError as exc:raise ProtocolError('invalid consent authenticator data') from exc
    require(counter==consent['credential_sign_count'],'consent counter does not match the signed assertion')


def verify_owner_approval(request,intent,owner,record,user_handle,*,now):
    """Verify bytes only; caller must commit counter + consent + challenge atomically.

    The intent, record and user handle must come from the admitted Wallet's
    current transaction. This does not consume a challenge or issue consent.
    """
    validate_owner_request(request);admit_intent_action(intent,owner,'approve',now=now)
    require(request['op']=='game.connection.approve' and request['intent_id']==intent['binding']['intent_id'] and
            request['challenge_id']==intent['challenge_id'] and request['binding_sha256']==intent['binding_sha256'],
            'approval refers to another saved challenge or binding')
    require(request['credential']['id'] in {row['id'] for row in intent['options']['publicKey']['allowCredentials']},
            'credential is not admitted by the saved challenge')
    try:
        return auth.verify_assertion(request['credential'],challenge=intent['options']['publicKey']['challenge'],
                                     rp_id=RP_ID,origin=auth.ORIGIN,record=record,user_handle=user_handle)
    except auth.AuthError as exc:raise ProtocolError('owner assertion rejected') from exc
    except auth.AuthUnavailable as exc:raise VerificationUnavailable('owner assertion verification unavailable') from exc


def validate_game_request(value):
    canonical(value);require(type(value) is dict and type(value.get('v')) is int and value['v']==1 and type(value.get('op')) is str,'invalid game envelope')
    if value['op'] not in GAME_OPERATIONS:raise FeatureDisabled('game assets/exchange/history unavailable')
    fields(value,{'v','op'}|GAME_OPERATIONS[value['op']]);uuid_value(value['connection_id'])
    if 'key' in value:identifier(value['key'],128)
    return value


def required_game_scope(operation):
    if operation not in GAME_OPERATIONS:raise FeatureDisabled('game operation unavailable')
    return 'connection:revoke' if operation=='connection.revoke' else 'connection:read'


def scope_digest(value):
    fields(value,{'wallet_authority_id','owner_ref','account_id','device_ref','credential_revision','operation','limit','filter'})
    uuid_value(value['wallet_authority_id']);identifier(value['account_id'])
    for key in ('owner_ref','device_ref'):identifier(value[key])
    integer(value['credential_revision'],1);integer(value['limit'],1,50)
    require(value['operation']=='game.connection.list' and value['filter']=='all','unsupported cursor scope')
    return hash_object(b'RockGameConnectionCursorScope-v1\0',value)


def validate_cursor(value):
    fields(value,{'schema','environment','issuer','scope_sha256','after_id','issued_at','expires_at','algorithm','credential_id','credential_revision','signature'})
    common(value,'rock-game-connection-cursor/1');signature_fields(value);uuid_value(value['issuer']);uuid_value(value['after_id']);digest(value['scope_sha256'])
    integer(value['issued_at'],1);integer(value['expires_at'],value['issued_at']+1,min(MAX_INT,value['issued_at']+120));return value


def encode_cursor(value):validate_cursor(value);raw=canonical(value);require(len(raw)<=4096,'cursor byte bound');return b64(raw)


def verify_cursor(token,keys,scope,*,now):
    value=decode(unb64(token,1,4096));validate_cursor(value);integer(now,1);scope_hash=scope_digest(scope)
    require(value['issuer']==scope['wallet_authority_id'] and value['scope_sha256']==scope_hash and value['issued_at']<=now<value['expires_at'],
            'cursor scope or lifetime mismatch')
    verify_signature('cursor',value,keys,issuer=value['issuer'],signed_at=value['issued_at'],now=now,current=True);return value


def capabilities():
    # Validators are not executable operations. Deployment must not claim a
    # connection, asset API or exchange until its actual managed path is tested.
    return {'connections':False,'assets_snapshot':False,'exchange':False,'history':False,'simulation_only':True}
