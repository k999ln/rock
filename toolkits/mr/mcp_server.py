#!/usr/bin/env python3
"""Rock star's four allowlisted Mr. tools over MCP stdio or authenticated loopback HTTP.

No arbitrary commands, host paths, network fetches, or persistent input storage.
"""
from __future__ import annotations
import argparse
import base64
import contextlib
import hmac
import io
import json
import math
from pathlib import Path, PurePosixPath
import secrets
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
import rock_star_tools

PROTOCOLS = ('2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05')
MAX_BODY = 16_000_000
PORT = 38479
ORIGINS = {'https://rock-star.kirin-999.chatgpt.site', 'https://loop-automation-hub.kirin-999.chatgpt.site', 'http://127.0.0.1:3001', 'http://localhost:3001'}

def schema(properties, required):
    return {'type':'object','properties':properties,'required':required,'additionalProperties':False}

TEXT = {'type':'string','minLength':1,'maxLength':100_000}
TOOLS = [
    {'name':'coconala_check','title':'ココナラ案件チェック','description':'依頼文と提案文の条件を照合。応募・送信はしません。',
     'inputSchema':schema({'brief':TEXT,'proposal':TEXT,'bucket':{'type':'string','enum':['single','retainer']},'orderRate':{'type':['number','null'],'minimum':0,'maximum':100}},['brief','proposal'])},
    {'name':'format_citations','title':'出典整理','description':'Markdown中の出典リンクを末尾にまとめます。',
     'inputSchema':schema({'text':TEXT},['text'])},
    {'name':'make_free_article','title':'記事の無料版を作成','description':'指定された原稿とまとめから無料版を作成します。投稿しません。',
     'inputSchema':schema({'markdown':TEXT,'summary':{'type':'string','maxLength':3000},'afterChars':{'type':'integer','minimum':1,'maximum':100000},'price':{'type':'integer','minimum':1,'maximum':1000000},'paidContents':{'type':'string','maxLength':300},'noteUrl':{'type':'string','maxLength':2000}},['markdown','summary','afterChars','price','paidContents','noteUrl'])},
    {'name':'verify_delivery','title':'納品記録の照合','description':'渡された契約・成果物・制作記録・独立レビューをPC内で照合。ファイルは一時領域で処理し削除します。sample=trueは合成サンプルです。',
     'inputSchema':schema({'sample':{'type':'boolean'},'review':{'type':'object'},'files':{'type':'array','maxItems':120,'items':schema({'path':{'type':'string','maxLength':500},'base64':{'type':'string'}},['path','base64'])}},[])},
]
for tool in TOOLS:
    tool['annotations'] = {'readOnlyHint':True,'destructiveHint':False,'idempotentHint':True,'openWorldHint':False}

def validate(name, args):
    tool=next((t for t in TOOLS if t['name']==name),None)
    if not tool or not isinstance(args,dict):
        raise ValueError('許可されたツールと入力を指定してください。')
    spec=tool['inputSchema']
    if set(args)-set(spec['properties']) or set(spec['required'])-set(args):
        raise ValueError('入力項目が不足しているか、未対応の項目があります。')
    for key, value in args.items():
        s=spec['properties'][key]; typ=s['type']
        if value is None and isinstance(typ,list) and 'null' in typ: continue
        if typ=='string' and (not isinstance(value,str) or not s.get('minLength',0)<=len(value)<=s.get('maxLength',MAX_BODY)):
            raise ValueError('テキストの長さと形式を確認してください。')
        if typ=='boolean' and not isinstance(value,bool): raise ValueError('真偽値が必要です。')
        if typ=='object' and not isinstance(value,dict): raise ValueError('JSONオブジェクトが必要です。')
        if typ=='array' and (not isinstance(value,list) or len(value)>s['maxItems']): raise ValueError('ファイル数を確認してください。')
        if typ=='integer' or isinstance(typ,list):
            if isinstance(value,bool) or not isinstance(value,(int,float)) or not s['minimum']<=value<=s['maximum'] or not math.isfinite(value) or (typ=='integer' and not isinstance(value,int)):
                raise ValueError('数値の範囲を確認してください。')
        if 'enum' in s and value not in s['enum']:raise ValueError('指定できない選択肢です。')

def unpack_files(root, files):
    total=0; seen=set()
    for entry in files:
        if not isinstance(entry,dict) or set(entry)!={'path','base64'} or not isinstance(entry['path'],str) or not isinstance(entry['base64'],str):raise ValueError('ファイル形式が不正です。')
        path=PurePosixPath(entry['path'])
        if not entry['path'] or len(entry['path'])>500 or path.is_absolute() or '..' in path.parts or '\\' in entry['path'] or ':' in entry['path'] or '\x00' in entry['path'] or str(path) in seen or str(path)=='.':raise ValueError('ファイルの相対パスを確認してください。')
        seen.add(str(path)); content=base64.b64decode(entry['base64'],validate=True);total+=len(content)
        if total>10_000_000:raise ValueError('ファイルの合計は10 MB以下にしてください。')
        dest=root.joinpath(*path.parts);dest.resolve().relative_to(root.resolve());dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(content)

def execute(name,args):
    validate(name,args)
    with tempfile.TemporaryDirectory(prefix='rock-star-mcp-') as temporary:
        root=Path(temporary)
        if name=='format_citations':
            output=rock_star_tools.protected_citations(args['text'])
        elif name=='coconala_check':
            if not args['brief'].strip() or not args['proposal'].strip():raise ValueError('依頼文と提案文を入力してください。')
            module=rock_star_tools.load_module('application_eligibility');module.min_client_order_rate=lambda:40.0
            rate=args.get('orderRate')
            result=module.evaluate_application(args['brief'],args['proposal'],bucket=args.get('bucket','single'),market=None if rate is None else {'client_order_rate':rate})
            labels={'retainer_applications_disabled':'継続案件は対象外です。','synchronous_live_presence_required':'面談など同期での参加が求められています。','buyer_participant_seller_provider_role_mismatch':'依頼者の募集対象と提案内容が食い違う可能性があります。','market_snapshot_missing':'発注率が未確認です。','client_order_rate_below_threshold':'発注率は40%以下です。優先順位を判断する材料です。'}
            output=('条件に一致しました。' if result['allowed'] else '確認が必要な条件があります。')+'\n\n'+'\n'.join('- '+labels.get(k,k) for k in result['reason_codes']+result['ranking_codes'])+'\n\n受注・規約適合・収益の保証ではありません。応募・送信は行っていません。'
            return {'output':output,'status':'PASS' if result['allowed'] else 'NEEDS_REVIEW'}
        elif name=='make_free_article':
            draft=root/'article.md';draft.write_text(args['markdown'],encoding='utf-8')
            summary=root/'summary.md';summary.write_text(args['summary'],encoding='utf-8')
            output=rock_star_tools.free_article(argparse.Namespace(input=str(draft),summary=str(summary),after_chars=args['afterChars'],price=args['price'],paid_contents=args['paidContents'],note_url=args['noteUrl']))
        else:
            if args.get('sample') is True:
                if set(args)!={'sample'}:raise ValueError('サンプルと実データは同時に指定できません。')
                workspace=rock_star_tools.ROOT/'examples'/'delivery'
                data=json.loads((rock_star_tools.ROOT/'examples'/'delivery-review.json').read_text())
            else:
                if not args.get('files') or not isinstance(args.get('review'),dict):raise ValueError('レビューJSONと成果物フォルダが必要です。')
                unpack_files(root,args['files']);workspace=root;data=args['review']
            result=rock_star_tools.verify_delivery(argparse.Namespace(workspace=str(workspace)),data)
            output=('【合成サンプルの照合】\n' if args.get('sample') else '')+json.dumps(result,ensure_ascii=False,indent=2)
            return {'output':output,'status':result['status']}
        return {'output':output}

def rpc(message):
    if not isinstance(message,dict) or message.get('jsonrpc')!='2.0' or not isinstance(message.get('method'),str):
        return {'jsonrpc':'2.0','id':None,'error':{'code':-32600,'message':'Invalid request'}}
    if 'id' not in message:return None
    ident=message['id']
    if isinstance(ident,(dict,list,bool)) or ident is None:return {'jsonrpc':'2.0','id':None,'error':{'code':-32600,'message':'Invalid id'}}
    method=message['method'];params=message.get('params',{})
    if not isinstance(params,dict):return {'jsonrpc':'2.0','id':ident,'error':{'code':-32602,'message':'Invalid params'}}
    if method=='initialize':
        requested=params.get('protocolVersion');result={'protocolVersion':requested if requested in PROTOCOLS else PROTOCOLS[0],'capabilities':{'tools':{}},'serverInfo':{'name':'rock-star-mr','version':'0.2.0'},'instructions':'4つのツールを入力データだけで実行します。金銭・投稿・任意シェル実行は扱いません。'}
    elif method=='ping':result={}
    elif method=='tools/list':result={'tools':TOOLS}
    elif method=='tools/call':
        try:
            # Third-party diagnostics must not corrupt stdout or log user inputs.
            with contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
                value=execute(params.get('name'),params.get('arguments',{}))
            result={'content':[{'type':'text','text':value['output']}],'structuredContent':value,'isError':False}
        except (ValueError,TypeError,KeyError,OSError,SystemExit):
            result={'content':[{'type':'text','text':'入力の形式・文字数・必須項目・成果物の記録を確認してください。'}],'isError':True}
    else:return {'jsonrpc':'2.0','id':ident,'error':{'code':-32601,'message':'Method not found'}}
    return {'jsonrpc':'2.0','id':ident,'result':result}

def stdio():
    while True:
        line=sys.stdin.buffer.readline(MAX_BODY+1)
        if not line:break
        if len(line)>MAX_BODY:
            # End the session rather than parse fragments of an oversized message.
            break
        try:result=rpc(json.loads(line))
        except (json.JSONDecodeError,UnicodeDecodeError,RecursionError):result={'jsonrpc':'2.0','id':None,'error':{'code':-32700,'message':'Parse error'}}
        if result is not None:print(json.dumps(result,ensure_ascii=False),flush=True)

class Bridge(BaseHTTPRequestHandler):
    tokens={}
    def setup(self):
        super().setup()
        self.connection.settimeout(10)
    def log_message(self,*args):pass
    def allowed(self):
        return self.headers.get('Origin') in ORIGINS and self.headers.get('Host')==f'127.0.0.1:{PORT}'
    def respond(self,status,data=None):
        encoded=json.dumps(data,ensure_ascii=False).encode() if data is not None else b''
        self.send_response(status)
        if self.allowed():
            self.send_header('Access-Control-Allow-Origin',self.headers['Origin']);self.send_header('Vary','Origin')
            self.send_header('Access-Control-Allow-Headers','Content-Type, Authorization, MCP-Protocol-Version')
            self.send_header('Access-Control-Allow-Methods','POST, OPTIONS')
            self.send_header('Access-Control-Allow-Private-Network','true')
        self.send_header('Cache-Control','no-store');self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(encoded)));self.end_headers();self.wfile.write(encoded)
    def do_OPTIONS(self):self.respond(204 if self.allowed() else 403)
    def do_GET(self):self.respond(405)
    def do_POST(self):
        if not self.allowed():return self.respond(403,{'error':'Origin denied'})
        if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.respond(415)
        try:length=int(self.headers.get('Content-Length','0'))
        except ValueError:return self.respond(400)
        if not 0<length<=MAX_BODY:return self.respond(413)
        if self.path not in ('/connect','/mcp'):return self.respond(404)
        if self.path=='/mcp':
            expected=self.tokens.get(self.headers['Origin'])
            if not expected or not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+expected):return self.respond(401)
            if self.headers.get('MCP-Protocol-Version',PROTOCOLS[0]) not in PROTOCOLS:return self.respond(400)
        try:data=json.loads(self.rfile.read(length))
        except (json.JSONDecodeError,UnicodeDecodeError,RecursionError):return self.respond(400)
        if self.path=='/connect':
            if data!={}:return self.respond(400)
            token=self.tokens.setdefault(self.headers['Origin'],secrets.token_urlsafe(32));return self.respond(200,{'token':token,'server':'rock-star-mr'})
        result=rpc(data);return self.respond(202 if result is None else 200,result)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--http',action='store_true');args=parser.parse_args()
    if args.http:
        server=HTTPServer(('127.0.0.1',PORT),Bridge);server.timeout=30
        print(f'Rock star PC接続を開始しました。サイトの「このPCを接続」を押してください。終了: Ctrl+C',file=sys.stderr)
        try:server.serve_forever()
        except KeyboardInterrupt:server.server_close()
    else:stdio()
