import unittest
from power_button_model import PowerButtonModel as M, qualify_edges

def names(m):return [e['event'] for e in m.events]
def click(m,t=0,length=100):m.down(t);m.up(t+length)

class BehaviorTests(unittest.TestCase):
 def test_single_waits_for_double_window_and_then_enters_standby(self):
  m=M(capture_enabled=True);click(m);m.advance(449);self.assertEqual(m.state,'RUNNING');m.advance(450);self.assertEqual(m.state,'USER_STANDBY');self.assertFalse(m.capture_enabled)
 def test_double_goes_home_without_transient_standby(self):
  m=M(capture_enabled=True);click(m);click(m,300);m.advance(1000);self.assertEqual(names(m),['SHOW_HOME_OR_LOCK_SCREEN']);self.assertFalse(m.capture_enabled)
 def test_standby_single_resumes_without_capture(self):
  m=M(state='USER_STANDBY');click(m);m.advance(450);self.assertEqual(m.state,'RUNNING');self.assertFalse(m.capture_enabled)
 def test_double_from_standby_is_one_home_action(self):
  m=M(state='USER_STANDBY');click(m);click(m,200);m.advance(1000);self.assertEqual(names(m),['SHOW_HOME_OR_LOCK_SCREEN'])
 def test_exact_double_deadline_is_two_single_gestures(self):
  m=M();click(m);click(m,450);m.advance(1000);self.assertEqual(names(m),['ENTER_USER_STANDBY','RESUME_UI_WITH_INPUT_OFF'])
 def test_second_down_freezes_single_until_its_release(self):
  m=M();click(m);m.down(400);m.advance(700);self.assertEqual(names(m),[]);m.up(800);self.assertEqual(names(m),['SHOW_HOME_OR_LOCK_SCREEN'])
 def test_long_release_requests_shutdown_without_cutting_power(self):
  m=M();m.down(0);m.advance(3000);self.assertEqual(names(m),['LONG_FEEDBACK']);m.up(3200);self.assertIn('GRACEFUL_SHUTDOWN_REQUEST',names(m));self.assertEqual(m.state,'RUNNING')
 def test_holding_past_three_does_not_run_normal_off_before_release(self):
  m=M();m.down(0);m.advance(9999);self.assertNotIn('GRACEFUL_SHUTDOWN_REQUEST',names(m));self.assertNotIn('FORCE_OFF_REQUEST',names(m))
 def test_force_threshold_emits_once_and_does_not_claim_off(self):
  m=M();m.down(0);m.advance(10000);m.advance(17000);m.up(18000);self.assertEqual(names(m).count('FORCE_OFF_REQUEST'),1);self.assertNotIn('GRACEFUL_SHUTDOWN_REQUEST',names(m));self.assertEqual(m.state,'RUNNING')
 def test_off_is_recorded_only_on_device_confirmation(self):
  m=M();m.down(0);m.advance(10000);m.confirmed_off(10300);m.up(11000);self.assertEqual(m.state,'OFF');self.assertEqual(names(m).count('FORCE_OFF_REQUEST'),1)
 def test_second_press_becoming_long_cancels_first_single(self):
  m=M();click(m);m.down(250);m.up(3350);self.assertIn('GRACEFUL_SHUTDOWN_REQUEST',names(m));self.assertNotIn('ENTER_USER_STANDBY',names(m));self.assertNotIn('SHOW_HOME_OR_LOCK_SCREEN',names(m))
 def test_incomplete_long_has_no_short_fallback(self):
  m=M();m.down(0);m.up(2999);m.advance(4000);self.assertEqual(names(m),['INCOMPLETE_LONG_NO_ACTION'])
 def test_invalid_very_short_second_does_not_lose_first_single(self):
  m=M();click(m);m.down(430);m.up(450);self.assertEqual(names(m),['ENTER_USER_STANDBY'])
 def test_off_initial_press_starts_once_and_never_forces_off(self):
  m=M(state='OFF',ready=False);m.down(0);m.host_ready(3000,'new-boot');m.advance(15000);m.up(16000);self.assertEqual(names(m),['BOOT_REQUEST'])
 def test_off_double_is_absorbed_even_if_host_is_ready_quickly(self):
  m=M(state='OFF',ready=False);m.down(0);m.host_ready(50,'new-boot');m.up(100);click(m,200);m.advance(1200);self.assertEqual(m.state,'RUNNING');self.assertEqual(names(m).count('BOOT_REQUEST'),1);self.assertNotIn('ENTER_USER_STANDBY',names(m))
 def test_booting_short_is_not_replayed_after_ready(self):
  m=M(state='BOOTING',ready=False);click(m);m.host_ready(500,'new-boot');m.advance(2000);self.assertEqual(m.state,'RUNNING');self.assertNotIn('ENTER_USER_STANDBY',names(m))
 def test_fresh_hold_during_booting_can_request_force_off(self):
  m=M(state='BOOTING',ready=False);m.down(0);m.advance(10000);self.assertIn('FORCE_OFF_REQUEST',names(m))
 def test_shutdown_ack_then_short_does_not_restart(self):
  m=M();m.down(0);m.up(3100);m.shutdown_ack(3200);click(m,3400);m.advance(4000);self.assertEqual(m.state,'SHUTTING_DOWN');self.assertNotIn('BOOT_REQUEST',names(m))
 def test_shutdown_has_no_automatic_force_timeout(self):
  m=M();m.shutdown_ack(0);m.advance(120000);self.assertNotIn('FORCE_OFF_REQUEST',names(m));self.assertEqual(m.state,'SHUTTING_DOWN')
 def test_update_blocks_normal_gestures_but_not_fresh_emergency_hold(self):
  m=M();m.enter_update(0);click(m,100);m.down(1000);m.up(4100);m.down(5000);m.advance(15000);self.assertNotIn('GRACEFUL_SHUTDOWN_REQUEST',names(m));self.assertIn('FORCE_OFF_REQUEST',names(m))
 def test_triple_click_does_not_toggle_after_double(self):
  m=M();click(m);click(m,200);click(m,400);m.advance(1000);self.assertEqual(names(m).count('SHOW_HOME_OR_LOCK_SCREEN'),1);self.assertNotIn('ENTER_USER_STANDBY',names(m))
 def test_hold_during_click_suppression_still_has_emergency_path(self):
  m=M();click(m);click(m,200);m.down(400);m.advance(10400);self.assertIn('FORCE_OFF_REQUEST',names(m))
 def test_duplicate_down_does_not_reset_force_timer(self):
  m=M();m.down(0);m.down(5000);m.advance(10000);self.assertEqual(names(m).count('FORCE_OFF_REQUEST'),1)
 def test_power_restore_with_held_button_needs_release_then_new_press(self):
  m=M();m.lose_external_power(0);m.restore_external_power(100,pressed=True);m.advance(20000);self.assertNotIn('BOOT_REQUEST',names(m));self.assertNotIn('FORCE_OFF_REQUEST',names(m));m.up(20100);m.down(21000);self.assertEqual(names(m).count('BOOT_REQUEST'),1)
 def test_no_external_power_means_no_boot_action(self):
  m=M();m.lose_external_power(0);click(m,100);self.assertNotIn('BOOT_REQUEST',names(m));self.assertEqual(m.state,'NO_POWER')
 def test_confirmation_while_holding_never_reboots(self):
  m=M();m.down(0);m.advance(10000);m.confirmed_off(10100);m.advance(40000);m.up(41000);self.assertNotIn('BOOT_REQUEST',names(m));self.assertEqual(m.state,'OFF')
 def test_stale_duplicate_or_wrong_session_events_are_rejected(self):
  m=M();self.assertTrue(m.accept_os_event(boot_id='boot-1',sequence=1,age_ms=30));self.assertFalse(m.accept_os_event(boot_id='boot-1',sequence=1,age_ms=31));self.assertFalse(m.accept_os_event(boot_id='old',sequence=2,age_ms=1));self.assertFalse(m.accept_os_event(boot_id='boot-1',sequence=2,age_ms=2001));self.assertFalse(m.accept_os_event(boot_id='boot-1',sequence=2,age_ms=-1));self.assertFalse(m.accept_os_event(boot_id='boot-1',sequence=2,age_ms=1,controller_boot_id='old-controller'))
 def test_clock_reversal_cannot_extend_or_replay_gesture(self):
  m=M();m.down(100)
  with self.assertRaises(ValueError):m.advance(99)
 def test_bounce_filter_emits_one_down_and_one_up(self):
  samples=[(0,False),(1,True),(3,False),(5,True),(20,True),(35,True),(100,False),(102,True),(104,False),(134,False)]
  self.assertEqual(qualify_edges(samples),[(35,True),(134,False)])
 def test_unstable_signal_is_not_a_press(self):
  self.assertEqual(qualify_edges([(0,False),(1,True),(20,False),(40,False)]),[])

 def test_transition_origin_short_is_not_promoted_after_host_ready(self):
  for state in ('BOOTING','SHUTTING_DOWN','UPDATING'):
   with self.subTest(state=state):
    m=M(state=state,ready=False);m.down(0);m.host_ready(60,'new');m.up(100);m.advance(1000)
    self.assertNotIn('ENTER_USER_STANDBY',names(m));self.assertNotIn('SHOW_HOME_OR_LOCK_SCREEN',names(m));self.assertEqual(m.state,'RUNNING')
 def test_transition_origin_long_is_not_promoted_after_host_ready(self):
  for state in ('BOOTING','SHUTTING_DOWN','UPDATING'):
   with self.subTest(state=state):
    m=M(state=state,ready=False);m.down(0);m.host_ready(1000,'new');m.up(3100)
    self.assertNotIn('GRACEFUL_SHUTDOWN_REQUEST',names(m));self.assertEqual(m.state,'RUNNING')

if __name__=='__main__':unittest.main()
