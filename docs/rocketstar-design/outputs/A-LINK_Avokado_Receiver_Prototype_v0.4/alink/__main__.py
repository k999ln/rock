"""Lab entry points. No network action occurs just by importing this module."""
import argparse
import json
import os
import signal
import stat
import sys
import threading
import time
from pathlib import Path
from .protocol import Codec, parse
from .storage import InboxStore, record_digest
from .policy import Route, Selector
from .transport import HTTPLink
from .quota import AttemptBudget, BudgetedLink
from .receiver import Receiver

def load_key(path):
    path=Path(path)
    info=path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_size != 32:
        raise ValueError("key file must contain exactly 32 random binary bytes")
    if os.name=="posix" and stat.S_IMODE(info.st_mode) & 0o077:
        raise ValueError("key file must be accessible only to its owner (mode 0600)")
    return path.read_bytes()

def load_config(path, mode):
    config=json.loads(Path(path).read_text())
    if config.get("mode") != mode:
        raise ValueError("configuration mode does not match this lab command")
    root=Path(path).resolve().parent
    keypath=root/config["key_file"]
    state=(root/config.get("state_dir","local-state")).resolve()
    state.mkdir(mode=0o700,parents=True,exist_ok=True)
    if os.name=="posix":state.chmod(0o700)
    codec=Codec(config["device"],load_key(keypath))
    return config,state,codec

def stop_flag():
    event=threading.Event()
    for sig in (signal.SIGINT,signal.SIGTERM):signal.signal(sig,lambda *_:event.set())
    return event

def receive_ip(args):
    config,state,codec=load_config(args.config,"live-ip-lab")
    budget=AttemptBudget(state/"budget.sqlite",config["budget_epoch"])
    routes=[]
    for p in config["routes"]:
        if p.get("allowed") is not True:continue
        if p["name"] not in ("wifi","cellular"):
            raise ValueError("live IP lab supports provisioned Wi-Fi/cellular interfaces only")
        raw=HTTPLink(p["name"],p["endpoint"],codec,interface=p["interface"],timeout=3)
        link=BudgetedLink(raw,budget,p["max_attempts"])
        routes.append(Route(p["name"],0 if p["name"]=="wifi" else 1,link,allowed=True))
    if not routes:raise ValueError("no explicitly provisioned and allowed IP route")
    store=InboxStore(state/"inbox.sqlite")
    app=Receiver(store,Selector(routes));stop=stop_flag();ticks=0
    try:
        while not stop.is_set():
            report=app.tick(time.monotonic(),time.time())
            report["environment"]="live IP lab; no radio acceptance claim"
            report["route_errors"]={r.name:r.last_error for r in routes if r.last_error}
            print(json.dumps(report,ensure_ascii=False),flush=True)
            ticks+=1
            if args.ticks and ticks>=args.ticks:break
            stop.wait(5)
    finally:store.close()

def radio(args):
    from .radio9704 import Radio9704
    config,state,codec=load_config(args.config,"radio-lab")
    if config.get("radio_approved") is not True:
        raise ValueError("provisioned radio/contract/topic must be explicitly enabled in config")
    store=InboxStore(state/"inbox.sqlite")
    bridge=Radio9704(store,codec,config["serial_port"],topic=config["topic"],
                     attempt_budget=AttemptBudget(state/"budget.sqlite",config["budget_epoch"]),
                     max_receipt_attempts=config["max_receipt_attempts"])
    try:bridge.run(stop_flag())
    finally:store.close()

def main():
    parser=argparse.ArgumentParser(description="A-LINK receiver lab prototype")
    sub=parser.add_subparsers(dest="command",required=True)
    sub.add_parser("demo",help="local sockets only; no modem")
    p=sub.add_parser("new-lab-key",help="create a new owner-only random test key")
    p.add_argument("path",type=Path)
    for name in ("receive-ip","radio"):
        p=sub.add_parser(name);p.add_argument("--config",required=True,type=Path)
        if name=="receive-ip":p.add_argument("--ticks",type=int,default=0)
    p=sub.add_parser("make-delivery",help="encrypt one notification for manual provider-console lab delivery")
    p.add_argument("--record",required=True,type=Path);p.add_argument("--key",required=True,type=Path)
    p.add_argument("--device",required=True);p.add_argument("--output",required=True,type=Path)
    p=sub.add_parser("confirm-receipt",help="verify a received application receipt and create its encrypted confirmation")
    for name in ("receipt","record","key","output"):p.add_argument("--"+name,required=True,type=Path)
    p.add_argument("--device",required=True)
    args=parser.parse_args()
    if args.command=="demo":
        from .demo import run_demo
        print(json.dumps(run_demo(),ensure_ascii=False,indent=2))
    elif args.command=="new-lab-key":
        fd=os.open(args.path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        with os.fdopen(fd,"wb") as file:
            file.write(os.urandom(32));file.flush();os.fsync(file.fileno())
        print("試験用鍵を作成しました。鍵は共有先を限定し、配布ZIPへ入れないでください。")
    elif args.command=="receive-ip":receive_ip(args)
    elif args.command=="radio":radio(args)
    else:
        record=json.loads(args.record.read_text());digest=record_digest(record)
        codec=Codec(args.device,load_key(args.key))
        if args.command=="make-delivery":
            packet=codec.seal({"records":[record]},"delivery")
        else:
            body=codec.open(args.receipt.read_bytes(),"receipt")
            if set(body)!={"receipts"} or not isinstance(body["receipts"],list) or len(body["receipts"])!=1:
                raise ValueError("one receipt required")
            receipt=body["receipts"][0]
            if (not isinstance(receipt,dict) or set(receipt)!={"id","digest","status"} or
                receipt["id"]!=record["id"] or receipt["digest"]!=digest or receipt["status"] not in ("stored","expired")):
                raise ValueError("receipt does not match the original record")
            packet=codec.seal({"confirmed_receipts":[record["id"]]},"delivery")
        with args.output.open("xb") as file:file.write(packet)
        print(json.dumps({"packet_written":str(args.output),"wire_bytes":len(packet),"sent_to_provider":False},ensure_ascii=False))

if __name__=="__main__":
    try:main()
    except (ValueError,KeyError,RuntimeError,OSError) as exc:
        print("起動・入力を確認してください: "+str(exc),file=sys.stderr)
        sys.exit(2)
