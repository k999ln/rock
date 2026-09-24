import tempfile
from pathlib import Path
import unittest
from colony_core.core import Broker, Controller, ContractError, digest


class ReceiptEdgeTests(unittest.TestCase):
    def test_non_json_receipt_leaves_result_uncertain(self):
        with tempfile.TemporaryDirectory() as d:
            c=Controller(Path(d)/'controller.sqlite',clock=lambda:1000)
            b=Broker(Path(d)/'broker.sqlite',clock=lambda:1000)
            try:
                c.acquire_authority('ops-A',0);c.step();b.refresh(c)
                command=b.prepare(1);b.approve(command['commandId'],digest(command))
                b.dispatch(command['commandId'],c,drop_receipt=True)
                r=c.query_receipt(command['commandId']);r['decidedAt']=float('nan')
                with self.assertRaisesRegex(ContractError,'RECEIPT_MISMATCH'):
                    b._accept_receipt(command,r)
                self.assertEqual(b.state(command['commandId']),'UNCERTAIN')
                b.reconcile(command['commandId'],c)
                self.assertEqual(b.state(command['commandId']),'SUCCEEDED')
            finally:b.close();c.close()


if __name__=='__main__':unittest.main()
