import importlib.util
import os
from pathlib import Path
import pty
import select
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('mini_driver',Path(__file__).resolve().parents[1]/'linux/supervisor_driver.py')
d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)

class DriverTests(unittest.TestCase):
 def test_decoder_noise_split_crc(self):
  packet=d.encode(d.STATUS,42,1,1,31)
  decoder=d.Decoder()
  self.assertEqual(decoder.feed(b'noise'+packet[:7]),[])
  self.assertEqual(decoder.feed(packet[7:])[0]['boot'],42)
  corrupt=bytearray(packet);corrupt[9]^=1
  self.assertEqual(decoder.feed(corrupt),[])
  self.assertEqual(decoder.feed(packet)[0]['sequence'],1)
  with self.assertRaises(ValueError):decoder.feed(b'a'*4097)
 def test_real_pty_nonce_epoch_staleness_and_stop(self):
  master,slave=pty.openpty();now=[1.0]
  driver=d.SupervisorDriver(os.ttyname(slave),clock=lambda:now[0])
  decoder=d.Decoder()
  def read():
   if not select.select([master],[],[],1)[0]:return []
   return decoder.feed(os.read(master,4096))
  try:
   os.write(master,d.encode(d.STATUS,42,1,1,31));value=driver.poll()
   self.assertEqual(value['state'],'observed');self.assertFalse(value['opticalOrMotionAuthority'])
   self.assertEqual(value['observedAtMonotonicMs'],1000)
   self.assertEqual(value['expiresAtMonotonicMs'],1200)
   self.assertEqual([f['kind'] for f in read()],[d.STOP,d.HEARTBEAT])
   now[0]=1.25;self.assertEqual(driver.poll(0)['state'],'unavailable')
   os.write(master,d.encode(d.STATUS,42,1,1,31));driver.poll();self.assertEqual(driver.snapshot()['state'],'unavailable')
   now[0]=1.3;os.write(master,d.encode(d.STATUS,42,2,2,0));driver.poll()
   self.assertEqual(driver.snapshot()['placeEpoch'],2)
   self.assertIn(d.STOP,[f['kind'] for f in read()])
   os.write(master,d.encode(d.STATUS,43,1,1,31));driver.poll()
   frames=read();self.assertEqual(frames[0]['boot'],43);self.assertEqual(frames[0]['kind'],d.STOP)
  finally:
   driver.close();self.assertIn(d.STOP,[f['kind'] for f in read()]);os.close(master);os.close(slave)
 def test_configured_usb_identity(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);device=root/'ttyACM0/device';device.mkdir(parents=True)
   for name,value in [('idVendor','2e8a'),('idProduct','0009'),('serial','ABC123')]: (device/name).write_text(value)
   d.validate_usb_identity('/dev/ttyACM0','ABC123',root)
   (device/'idProduct').write_text('000a')
   with self.assertRaises(ValueError):d.validate_usb_identity('/dev/ttyACM0','ABC123',root)
   (device/'idProduct').write_text('0009')
   with self.assertRaises(ValueError):d.validate_usb_identity('/dev/ttyACM0','OTHER',root)
   with self.assertRaises(ValueError):d.validate_usb_identity('/dev/ttyUSB0','ABC123',root)
   with self.assertRaises(ValueError):d.validate_usb_identity('/dev/ttyACM0','',root)
 def test_regular_file_rejected(self):
  with tempfile.NamedTemporaryFile() as file:
   with self.assertRaises(ValueError):d.SupervisorDriver(file.name)

if __name__=='__main__':unittest.main()
