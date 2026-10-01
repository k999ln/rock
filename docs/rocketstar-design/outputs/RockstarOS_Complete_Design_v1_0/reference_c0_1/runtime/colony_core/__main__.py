"""Reproducible SIM_ONLY demonstrations; no device, radio, or live-mode adapter."""
import argparse
import json
import time
from pathlib import Path
from .core import Controller, Broker, digest


def demo(directory):
    out=Path(directory);out.mkdir(parents=True,exist_ok=True)
    if any(out.glob('*.sqlite*')):
        raise SystemExit('Use a new evidence directory; old command history is never overwritten.')
    now=[1000.0]
    c=Controller(out/'controller.sqlite',clock=lambda:now[0])
    b=Broker(out/'supervisor.sqlite',clock=lambda:now[0])
    records=[]
    def record(event,**details):
        records.append({'event':event,'modelTime':now[0],**details})
    c.acquire_authority('ops-A',0,ttl=30);c.step();b.refresh(c)
    command=b.prepare(5,actor='planner')
    record('proposal',command=command,brokerState=b.state(command['commandId']))
    b.approve(command['commandId'],digest(command),actor='operator')
    b.dispatch(command['commandId'],c,drop_receipt=True)
    record('reply_lost',brokerState=b.state(command['commandId']),telemetry=c.step())
    b.close();b=Broker(out/'supervisor.sqlite',clock=lambda:now[0])
    receipt=b.reconcile(command['commandId'],c)
    record('reconciled_after_restart',receipt=receipt,brokerState=b.state(command['commandId']))
    record('reduced_supply',telemetry=c.set_supply_for_test(6))
    record('insufficient_critical_supply',telemetry=c.set_supply_for_test(3))
    record('supply_restored',telemetry=c.set_supply_for_test(10))
    now[0]=1031
    record('supervisory_lease_expired',telemetry=c.step())
    c.acquire_authority('ops-B',c.snapshot()['authorityEpoch']);c.step()
    record('local_authority_transferred',telemetry=c.snapshot())
    summary={
        'schema':'rockstaros-colony-demo-evidence/1','mode':'SIM_ONLY',
        'sourceClass':'SYNTHETIC','hardwareConnected':False,
        'limitations':['public fixture MAC keys','direct Python transport','synthetic loads only',
                      'no real-time or physical performance evidence'],
        'records':records}
    (out/'demo.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    c.close();b.close()
    print(json.dumps({'mode':'SIM_ONLY','events':len(records),'evidence':str(out/'demo.json')}))


def controller_worker(args):
    c=Controller(args.db,reboot=args.reboot)
    if args.ready:Path(args.ready).write_text('SIM_ONLY controller ready\n')
    try:
        for _ in range(args.ticks):
            c.step();time.sleep(args.interval)
    finally:c.close()


def supervisor_worker(args):
    b=Broker(args.db)
    if args.ready:Path(args.ready).write_text('SIM_ONLY supervisor ready\n')
    try:
        for _ in range(args.ticks):time.sleep(args.interval)
    finally:b.close()


def main():
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest='action',required=True)
    d=sub.add_parser('demo');d.add_argument('--output',required=True)
    for name in ['controller-worker','supervisor-worker']:
        w=sub.add_parser(name)
        w.add_argument('--db',required=True);w.add_argument('--ready')
        w.add_argument('--ticks',type=int,default=100)
        w.add_argument('--interval',type=float,default=.05)
        if name=='controller-worker':w.add_argument('--reboot',action='store_true')
    args=p.parse_args()
    if args.action=='demo':demo(args.output)
    elif args.action=='controller-worker':controller_worker(args)
    else:supervisor_worker(args)


if __name__=='__main__':main()
