import os
import tempfile
import time
import unittest
from contextlib import ExitStack
from pathlib import Path
from alink.fixture import FaultServer, DeliveryService
from alink.protocol import Codec
from alink.transport import HTTPLink, HardDown
from alink.policy import Route, Selector
from alink.storage import InboxStore
from alink.receiver import Receiver
from alink.quota import AttemptBudget, BudgetedLink

class EndToEnd(unittest.TestCase):
    def setUp(self):
        self.stack=ExitStack()
        self.temp=self.stack.enter_context(tempfile.TemporaryDirectory())
        self.path=Path(self.temp)/"inbox.sqlite"
        self.codec=Codec("test-hub",os.urandom(32))
        self.service=DeliveryService()
        self.servers=[self.stack.enter_context(FaultServer(self.codec,self.service)) for _ in range(3)]
        self.store=InboxStore(self.path)
        self.utc=time.time()
        self.receiver=self.make_receiver()
    def tearDown(self):
        self.store.close();self.stack.close()
    def make_receiver(self):
        routes=[Route(name,i,HTTPLink(name,server.url,self.codec,loopback_test=True,timeout=.5),allowed=True,
                      interval=5,is_satellite=(name=="satellite-model"))
                for i,(name,server) in enumerate(zip(["wifi","cellular","satellite-model"],self.servers))]
        return Receiver(self.store,Selector(routes))
    def queue(self,identity="message-1",expiry=600):
        record={"id":identity,"created_at":self.utc,"expires_at":self.utc+expiry,"payload":"avokadoへの通知"}
        self.service.queue(record);return record
    def tick(self,t):
        return self.receiver.tick(t,self.utc+t)

    def test_real_loopback_receive_and_ack(self):
        self.queue();result=self.tick(0)
        self.assertEqual(result["route"],"wifi")
        self.assertEqual(result["events"][0]["result"],"stored")
        self.assertEqual(self.service.acked,{"message-1"})
        self.assertEqual(len(self.store.messages()),1)
        self.assertEqual(self.store.pending_acks(),[])

    def test_wifi_cell_satellite_outage_and_resume(self):
        self.queue("wifi-msg");self.assertEqual(self.tick(0)["route"],"wifi")
        self.servers[0].mode="down";self.queue("cell-msg")
        self.assertEqual(self.tick(10)["route"],"cellular")
        self.servers[1].mode="down";self.queue("sat-msg")
        self.assertEqual(self.tick(20)["route"],"satellite-model")
        self.servers[2].mode="down";self.queue("waiting-msg")
        result=self.tick(30)
        self.assertIsNone(result["route"])
        self.assertEqual(len(self.store.messages()),3)
        self.servers[1].mode="ok"
        self.assertEqual(self.tick(100)["route"],"cellular")
        self.assertEqual(len(self.store.messages()),4)

    def test_portal_does_not_block_cellular(self):
        self.servers[0].mode="portal";self.queue()
        self.assertEqual(self.tick(0)["route"],"cellular")
        self.assertEqual(len(self.store.messages()),1)

    def test_bad_crypto_rejected_and_other_path_works(self):
        self.servers[0].mode="tamper";self.queue()
        self.assertEqual(self.tick(0)["route"],"cellular")
        self.assertEqual(self.store.messages()[0]["source"],"cellular")

    def test_ack_loss_restart_duplicate_and_retry(self):
        for s in self.servers:s.mode="drop_ack"
        self.queue();self.tick(0)
        self.assertEqual(len(self.store.messages()),1)
        self.assertEqual(len(self.store.pending_acks()),1)
        self.store.close();self.store=InboxStore(self.path)
        self.receiver=self.make_receiver()
        self.assertEqual(self.receiver.last_received,self.utc)
        # Deliberately replay from the service to test duplicate delivery across restart.
        self.service.acked.clear()
        for s in self.servers:s.mode="ok"
        result=self.tick(10)
        self.assertEqual(result["events"][0]["result"],"duplicate")
        self.assertEqual(len(self.store.messages()),1)
        self.assertEqual(self.store.pending_acks(),[])
        self.assertEqual(self.store.last_received_at(),self.utc)

    def test_expired_message_never_displayed(self):
        self.queue(expiry=1)
        result=self.tick(10)
        self.assertEqual(result["events"][0]["result"],"expired")
        self.assertEqual(self.store.messages(),[])
        self.assertEqual(self.service.acked,{"message-1"})

    def test_storage_full_is_not_acknowledged(self):
        self.store.close();self.store=InboxStore(self.path,max_messages=1)
        self.receiver=self.make_receiver()
        self.queue("one");self.tick(0)
        self.queue("two");result=self.tick(10)
        self.assertEqual(result["state"],"受信を保留・確認が必要")
        self.assertEqual(self.service.acked,{"one"})

    def test_budget_blocks_before_network_and_survives_restart(self):
        budgetfile=Path(self.temp)/"budget.sqlite"
        budget=AttemptBudget(budgetfile,"test")
        raw=self.receiver.selector.routes["wifi"].link
        limited=BudgetedLink(raw,budget,1)
        limited.probe();self.assertEqual(self.servers[0].requests,1)
        limited=BudgetedLink(raw,AttemptBudget(budgetfile,"test"),1)
        with self.assertRaises(HardDown):limited.receive()
        self.assertEqual(self.servers[0].requests,1)
        self.assertEqual(budget.used("wifi"),1)

    def test_zero_budget_does_not_touch_network(self):
        raw=self.receiver.selector.routes["wifi"].link
        guarded=BudgetedLink(raw,AttemptBudget(Path(self.temp)/"budget.sqlite","test"),0)
        with self.assertRaises(HardDown):guarded.probe()
        self.assertEqual(self.servers[0].requests,0)

if __name__=="__main__":unittest.main()
