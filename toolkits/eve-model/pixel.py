"""Nondestructive helper for this run's Pixel browser test, never a shell API."""
from __future__ import annotations
import argparse
import copy
import json
import hashlib
import hmac
import os
from pathlib import Path
import re
import shlex
import subprocess
import time
import urllib.request
import urllib.parse
import uuid
import xml.etree.ElementTree as ET
from manifest import atomic_json

ADB='/opt/homebrew/bin/adb';PORT=18749;BROWSER='app.vanadium.browser'
TITLE='Eve 開発実機テスト'

def adb(*args,binary=False):
    try:return subprocess.check_output([ADB,'-d',*args],text=not binary,stderr=subprocess.PIPE,timeout=30)
    except (subprocess.CalledProcessError,subprocess.TimeoutExpired):
        # am failure arguments could contain the private nonce fragment.
        raise ValueError('ADB operation failed; command/output withheld') from None

def target(root):
    if adb('get-state').strip()!='device' or adb('shell','getprop','ro.product.device').strip()!='frankel': raise ValueError('expected authorized USB frankel target')
    serial=adb('get-serialno').strip()
    if not serial or serial in ['unknown','unauthorized']:raise ValueError('authorized USB identity unavailable')
    p=root/'pixel-device-binding.json'
    if not p.exists():
        salt=os.urandom(32).hex();value={'salt':salt,'serialDigest':hashlib.sha256((salt+'|'+serial).encode()).hexdigest()}
        with open(p,'x',opener=lambda name,flags:os.open(name,flags,0o600)) as f:json.dump(value,f)
    value=json.loads(p.read_text())
    if not hmac.compare_digest(hashlib.sha256((value['salt']+'|'+serial).encode()).hexdigest(),value['serialDigest']):raise ValueError('USB device changed since this session binding')

def foreground():
    data=adb('shell','dumpsys','activity','activities')
    return next((x.strip() for x in data.splitlines() if 'topResumedActivity=' in x),'unknown')

def mappings():
    # Serial is deliberately discarded before any output or storage.
    rows=[]
    for line in adb('reverse','--list').splitlines():
        fields=line.split()
        if len(fields)>=3:rows.append({'local':fields[-2],'remote':fields[-1]})
    return rows

def connect(root):
    target(root);p=root/'usb-bridge.json';existing=mappings();port=f'tcp:{PORT}'
    match=[x for x in existing if x['local']==port]
    if match:
        record=json.loads(p.read_text()) if p.exists() else {}
        if record.get('createdByThisSession') is not True or record.get('active') is not True or record.get('port')!=PORT or record.get('target')!='frankel' or 'removedAt' in record or match!=[{'local':port,'remote':port}]: raise ValueError('existing unowned/conflicting USB mapping; refuse overwrite')
        return {'mappingAlreadyOwned':True,'port':PORT}
    adb('reverse','--no-rebind',port,port)
    result={'createdByThisSession':True,'active':True,'port':PORT,'target':'frankel','createdAt':time.time(),'serialRecorded':False}
    atomic_json(p,result);return result

def credentials(root):
    p=root/'bridge-credentials.json'
    if p.stat().st_mode&0o077:raise ValueError('credential file must be owner-only')
    value=json.loads(p.read_text())
    if value['port']!=PORT or not re.fullmatch('[a-f0-9]{64}',value['nonce']) or not re.fullmatch('[a-f0-9]{64}',value['token']):raise ValueError('invalid fixed bridge credentials')
    return value

def open_client(root,case_id=None,arm=None,fault=None):
    target(root);connect(root)
    if not (root/'candidate-manifest.json').exists():raise ValueError('trained candidate manifest required; do not show a fake candidate')
    receipt=json.loads((root/'training-supervisor.json').read_text())
    if receipt['exitCode']!=0 or receipt['stopReason'] is not None:raise ValueError('training did not complete successfully')
    with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/',timeout=5) as response:
        if TITLE not in response.read(100000).decode():raise ValueError('expected development page unavailable')
    c=credentials(root)
    params={}
    if case_id:
        known={json.loads(x)['id'] for x in (root/'observed-v3/development.jsonl').read_text().splitlines()}
        extra=root/'functional-v1/extra.jsonl'
        if extra.exists():known.update(json.loads(x)['id'] for x in extra.read_text().splitlines())
        if case_id not in known:raise ValueError('unknown fixed synthetic case')
        params['case']=case_id
    if arm:
        if arm not in ['A','C']:raise ValueError('unknown arm')
        params['arm']=arm
    if fault:
        if fault not in ['none','lost_response','delay_result','unavailable']:raise ValueError('unknown synthetic fault')
        params['fault']=fault
    query='?'+urllib.parse.urlencode(params) if params else ''
    # am prints the Intent including its fragment. Capture and discard that text.
    url=f'http://127.0.0.1:{PORT}/{query}#{c["nonce"]}'
    adb('shell','am','start','-a','android.intent.action.VIEW','-d',shlex.quote(url),'-p',BROWSER)
    return {'opened':True,'browser':BROWSER,'route':'Pixel browser → USB → Mac MLX','nativeInference':False,'noncePrinted':False}

def validate_ui(raw,adapter_prefix,c):
    if len(raw.encode())>250000 or c['nonce'] in raw or c['token'] in raw:raise ValueError('token-free test page not confirmed')
    tree=ET.fromstring(raw);nodes=list(tree.iter('node'))
    url=[n for n in nodes if n.get('resource-id')==BROWSER+':id/url_bar']
    addresses=[f'127.0.0.1:{PORT}',f'127.0.0.1:{PORT}/',f'http://127.0.0.1:{PORT}',f'http://127.0.0.1:{PORT}/']
    if len(url)!=1 or url[0].get('text') not in addresses or url[0].get('focused')=='true':raise ValueError('normal exact localhost page required; refuse URL editing/tab switcher/fragment')
    texts=[n.get('text','') for n in nodes]
    if TITLE not in texts or 'この課題を実行' not in texts or '保存済み結果を再読込' not in texts or not any(adapter_prefix in t and '候補' in t for t in texts):raise ValueError('connected Eve candidate controls not confirmed')
    bar_roots={'status_bar','navigation_bar_frame','navigation_bar_view'}
    bar_ids=bar_roots|{'status_bar_contents','status_bar_left_side','status_bar_start_side_content','status_bar_end_side_content','status_bar_end_side_container','clock','notification_icon_area','notification_icon_area_inner','centered_icon_area','system_icon_area','system_icons','mobile_combo','wifi_group','battery','home_handle','home_handle_parent','nav_buttons','back','home','recent_apps','ime_switcher'}
    parents={child:parent for parent in tree.iter() for child in parent}
    for n in nodes:
        package=n.get('package')
        if package==BROWSER:continue
        if package!='com.android.systemui':raise ValueError('unexpected app/permission overlay')
        rid=n.get('resource-id','');short=rid.removeprefix('com.android.systemui:id/')
        if rid and (not rid.startswith('com.android.systemui:id/') or short not in bar_ids):raise ValueError('notification/shade/dialog or unknown SystemUI surface')
        chain=[];cursor=n
        while cursor is not None:
            chain.append(cursor);cursor=parents.get(cursor)
        rooted=any(x.get('resource-id','').removeprefix('com.android.systemui:id/') in bar_roots for x in chain)
        outer_container=not rid and not n.get('text') and not n.get('content-desc') and any(x.get('resource-id','').removeprefix('com.android.systemui:id/') in bar_roots for x in n.iter('node'))
        if not rooted and not outer_container:raise ValueError('SystemUI is outside observed status/navigation bars')
        if n.get('text') and not (short=='clock' and re.fullmatch(r'\d{1,2}:\d{2}(?:\s?[AP]M)?',n.get('text'))):raise ValueError('unexpected SystemUI text')
        if not rid and n.get('content-desc'):raise ValueError('unexpected SystemUI overlay description')
    return tree

def browser_only_xml(tree):
    result=ET.Element('hierarchy');parents={child:parent for parent in tree.iter() for child in parent}
    for node in tree.iter('node'):
        if node.get('package')==BROWSER and parents.get(node,{}).get('package')!=BROWSER:result.append(copy.deepcopy(node))
    return ET.tostring(result,encoding='unicode')

def inspect_ui(root):
    target(root)
    if BROWSER not in foreground():raise ValueError('test browser not foreground; refuse UI read/input')
    remote='/data/local/tmp/eve-ui-'+uuid.uuid4().hex+'.xml'
    try:
        adb('shell','uiautomator','dump',remote)
        raw=adb('exec-out','cat',remote)
    finally:
        adb('shell','rm','--',remote)
    c=credentials(root)
    candidate=json.loads((root/'candidate-manifest.json').read_text())
    return raw,validate_ui(raw,candidate['adapterSha256'][:16],c)

def capture(root,case_id):
    if not re.fullmatch('[A-Za-z0-9_-]{1,80}',case_id):raise ValueError('invalid evidence identity')
    raw,tree=inspect_ui(root);directory=root/'pixel';directory.mkdir(exist_ok=True)
    png=directory/(case_id+'.png');xml=directory/(case_id+'.xml');state=directory/(case_id+'-state.json')
    if any(p.exists() for p in [png,xml,state]):raise ValueError('refuse evidence overwrite')
    image=adb('exec-out','screencap','-p',binary=True)
    if not image.startswith(b'\x89PNG\r\n\x1a\n') or len(image)>10*1024**2:raise ValueError('invalid/oversized screenshot')
    c=credentials(root);req=urllib.request.Request(f'http://127.0.0.1:{PORT}/api/state',headers={'Cookie':'eve_dev='+c['token']})
    with urllib.request.urlopen(req,timeout=5) as response:backend=json.loads(response.read(2*1024**2))
    inspect_ui(root)  # Discard capture if the owner changed away from our page.
    png.write_bytes(image);xml.write_text(browser_only_xml(tree))
    atomic_json(state,{'at':time.time(),'caseId':case_id,'foreground':foreground(),'backend':backend,
      'route':'Pixel browser → USB → Mac MLX','nativeInference':False,'scope':'synthetic development test page only'})
    return {'caseId':case_id,'png':str(png),'state':str(state),'nativeInference':False}

def tap(root,text):
    _,tree=inspect_ui(root)
    candidates=[x for x in tree.iter('node') if x.get('text')==text or x.get('content-desc')==text]
    if len(candidates)!=1:raise ValueError('exactly one observed UI target required')
    node=candidates[0];match=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',node.get('bounds',''))
    if not match:raise ValueError('observed bounds missing')
    x1,y1,x2,y2=map(int,match.groups())
    if x1>=x2 or y1>=y2:raise ValueError('nonvisible target')
    adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
    return {'tapped':text,'fromObservedBounds':True,'at':time.time()}

def cleanup(root):
    target(root);p=root/'usb-bridge.json';port=f'tcp:{PORT}'
    if not p.exists():return {'removed':False,'reason':'no owned mapping record'}
    record=json.loads(p.read_text())
    if record.get('createdByThisSession') is True and record.get('active') is True and record.get('port')==PORT and record.get('target')=='frankel' and 'removedAt' not in record:
        match=[x for x in mappings() if x['local']==port]
        if match and match!=[{'local':port,'remote':port}]:raise ValueError('mapping changed; do not remove')
        if match:adb('reverse','--remove',port)
        record['removedAt']=time.time();record['createdByThisSession']=False;record['active']=False;atomic_json(p,record);return {'removed':bool(match),'otherMappingsUntouched':True}
    return {'removed':False,'reason':'mapping ownership inactive; nothing removed'}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('action',choices=['connect','open','capture','tap','cleanup']);p.add_argument('--case');p.add_argument('--text')
    p.add_argument('--arm',choices=['A','C']);p.add_argument('--fault',choices=['none','lost_response','delay_result','unavailable'])
    a=p.parse_args()
    if a.action=='connect':result=connect(a.root)
    elif a.action=='open':result=open_client(a.root,a.case,a.arm,a.fault)
    elif a.action=='capture':result=capture(a.root,a.case)
    elif a.action=='tap':result=tap(a.root,a.text)
    else:result=cleanup(a.root)
    print(json.dumps(result,ensure_ascii=False))
