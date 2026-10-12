"""Local fault server for acceptance tests ONLY; never an Internet service.

Three loopback endpoints represent three logical bearers. They do not emulate
radio propagation, satellite capacity, modem firmware or Linux route switching.
"""
import socket
import threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from .protocol import MAX_WIRE, ProtocolError, parse
from .storage import record_digest

class DeliveryService:
    def __init__(self):
        self.records = {}
        self.acked = set()
        self.lock = threading.Lock()
        self.calls = []

    def queue(self, record):
        with self.lock:
            old = self.records.get(record["id"])
            if old and record_digest(old) != record_digest(record):
                raise ValueError("conflicting delivery id")
            self.records[record["id"]] = record.copy()

    def process(self, request):
        with self.lock:
            self.calls.append(request.get("op"))
            if request == {"op":"probe"}:
                return {"ready":True}
            if request == {"op":"receive"}:
                pending=[r for i,r in self.records.items() if i not in self.acked]
                return {"records":pending[:1]}
            if set(request)=={"op","receipts"} and request["op"]=="ack" and isinstance(request["receipts"],list):
                confirmed=[]
                for receipt in request["receipts"][:1]:
                    i=receipt["id"]
                    if i in self.records and receipt["digest"]==record_digest(self.records[i]) and receipt["status"] in ("stored","expired"):
                        self.acked.add(i);confirmed.append(i)
                return {"acknowledged":confirmed}
            raise ValueError("unknown operation")

class FaultServer:
    def __init__(self, codec, service):
        self.mode="ok"
        self.codec,self.service=codec,service
        self.requests=0
        parent=self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args): pass
            def do_POST(self):
                parent.requests+=1
                if parent.mode=="down":
                    self.connection.shutdown(socket.SHUT_RDWR);self.connection.close();return
                if parent.mode=="portal":
                    self.send_response(302);self.send_header("Location","http://portal.invalid/");self.end_headers();return
                if parent.mode=="unavailable":
                    self.send_response(503);self.end_headers();return
                if self.path!="/v1/exchange":
                    self.send_response(404);self.end_headers();return
                try:
                    count=int(self.headers.get("Content-Length","0"))
                    if not 0<count<=MAX_WIRE:raise ValueError("size")
                    packet=self.rfile.read(count)
                    challenge=parse(packet)["challenge"]
                    request=parent.codec.open(packet,"request",challenge)
                    result=parent.service.process(request)
                    if parent.mode=="drop_ack" and request["op"]=="ack":
                        # Server commits receipt then loses response: receiver must remain durable.
                        self.connection.shutdown(socket.SHUT_RDWR);self.connection.close();return
                    wire=parent.codec.seal(result,"response",challenge)
                    if parent.mode=="tamper":
                        wire=wire.replace(b'"ciphertext":"',b'"ciphertext":"A',1)
                    self.send_response(200);self.send_header("Content-Type","application/json")
                    self.send_header("Content-Length",str(len(wire)));self.end_headers();self.wfile.write(wire)
                except (ValueError,KeyError,TypeError,ProtocolError):
                    self.send_response(400);self.end_headers()
        self.server=ThreadingHTTPServer(("127.0.0.1",0),Handler)
        self.url=f"http://127.0.0.1:{self.server.server_port}"
        self.thread=threading.Thread(target=self.server.serve_forever,kwargs={"poll_interval":.05},daemon=True)

    def __enter__(self):
        self.thread.start();return self
    def __exit__(self,*args):
        self.server.shutdown();self.server.server_close();self.thread.join(timeout=2)
