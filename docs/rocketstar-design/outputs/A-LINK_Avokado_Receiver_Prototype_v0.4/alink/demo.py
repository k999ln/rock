"""Reproducible local socket demonstration; no satellite/hardware claim."""
import argparse
import json
import os
import tempfile
import time
from contextlib import ExitStack
from pathlib import Path
from .fixture import DeliveryService, FaultServer
from .protocol import Codec
from .transport import HTTPLink
from .storage import InboxStore
from .policy import Route, Selector
from .receiver import Receiver

def run_demo():
    start=time.monotonic()
    with ExitStack() as stack:
        tmp=Path(stack.enter_context(tempfile.TemporaryDirectory()))
        codec=Codec("avokado-demo",os.urandom(32))
        service=DeliveryService()
        servers=[stack.enter_context(FaultServer(codec,service)) for _ in range(3)]
        store=InboxStore(tmp/"receiver.sqlite")
        stack.callback(store.close)
        names=["Wi-Fi模擬","携帯回線模擬","衛星経路模擬"]
        def receiver():
            routes=[Route(names[i],i,HTTPLink(names[i],s.url,codec,loopback_test=True),allowed=True,
                          interval=5,is_satellite=i==2) for i,s in enumerate(servers)]
            return Receiver(store,Selector(routes))
        app=receiver();utc=time.time();steps=[]
        def queue(i):service.queue({"id":f"notice-{i}","created_at":utc,"expires_at":utc+3600,"payload":f"試験通知 {i}"})
        def tick(t,label):
            value=app.tick(t,utc+t)
            value.update(step=label,elapsed_model_seconds=t,displayed=len(store.messages(now=utc+t)))
            steps.append(value)
        queue(1);tick(0,"通常受信")
        servers[0].mode="down";queue(2);tick(10,"Wi-Fi遮断→携帯へ")
        servers[1].mode="down";queue(3);tick(20,"地上経路遮断→衛星経路の模擬へ")
        servers[2].mode="down";queue(4);tick(30,"全経路遮断→保存済み3件を維持")
        servers[1].mode="ok";tick(100,"携帯復旧→未受信4件目を取得")
        store.close();store=InboxStore(tmp/"receiver.sqlite");stack.callback(store.close)
        app=receiver();service.acked.remove("notice-4")
        tick(110,"受信器再起動＋同じ通知の再配信")
        assert steps[0]["route"]==names[0]
        assert steps[1]["route"]==names[1]
        assert steps[2]["route"]==names[2]
        assert steps[3]["route"] is None and steps[3]["displayed"]==3
        assert steps[4]["displayed"]==4
        assert steps[5]["displayed"]==4 and steps[5]["events"][0]["result"]=="duplicate"
        return {"result":"PASS","environment":"local HTTP sockets + SQLite, logical bearers only",
                "hardware_or_RF_test":False,"model_clock_used":True,
                "wall_seconds":round(time.monotonic()-start,3),"steps":steps}

def main():
    p=argparse.ArgumentParser();p.add_argument("--report",type=Path);args=p.parse_args()
    report=run_demo()
    if args.report:
        args.report.parent.mkdir(parents=True,exist_ok=True)
        args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=="__main__":main()
