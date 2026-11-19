#include <assert.h>
#include <stdio.h>
#include "../firmware/supervisor.h"
static struct mini_frame command(uint8_t kind,uint32_t sequence,uint32_t epoch) {return (struct mini_frame){.kind=kind,.boot=42,.sequence=sequence,.epoch=epoch};}
int main(void){
 struct mini_supervisor s;mini_init(&s,42);assert(!s.output&&s.fault);
 mini_tick(&s,0,MINI_REQUIRED);assert(!s.output);
 struct mini_frame hb=command(MINI_HEARTBEAT,1,1);assert(mini_receive(&s,10,&hb));
 struct mini_frame arm=command(MINI_ARM,2,1);assert(!mini_receive(&s,11,&arm));
 mini_tick(&s,12,MINI_REQUIRED|MINI_LOCAL_BUTTON);assert(mini_receive(&s,13,&arm));assert(s.output);
 assert(!mini_receive(&s,14,&arm)); /* replay */
 mini_tick(&s,263,MINI_REQUIRED);assert(!s.output&&!s.arm_valid); /* grant expiry cannot revive after timer wrap */
 arm.sequence=3;assert(mini_receive(&s,270,&arm));assert(s.output);
 mini_tick(&s,271,MINI_REQUIRED&~MINI_STOP_OK);assert(!s.output&&s.fault);
 mini_tick(&s,272,MINI_REQUIRED);arm.sequence=4;assert(!mini_receive(&s,273,&arm));
 mini_tick(&s,274,MINI_REQUIRED|MINI_LOCAL_BUTTON);assert(mini_receive(&s,275,&arm));assert(s.output);
 mini_tick(&s,510,MINI_REQUIRED);assert(!s.output&&s.fault&&!s.heartbeat_valid); /* expired heartbeat cannot revive after timer wrap */
 hb.sequence=5;assert(mini_receive(&s,520,&hb));
 mini_tick(&s,521,MINI_REQUIRED|MINI_LOCAL_BUTTON);arm.sequence=6;assert(mini_receive(&s,522,&arm));
 mini_tick(&s,523,MINI_REQUIRED&~MINI_DOCKED);assert(s.epoch==2&&!s.output&&!s.heartbeat_valid);
 arm.sequence=7;assert(!mini_receive(&s,524,&arm));
 mini_tick(&s,525,MINI_REQUIRED);assert(s.epoch==3&&!s.output);
 hb.sequence=8;hb.epoch=3;hb.boot=41;assert(!mini_receive(&s,526,&hb));
 hb.boot=42;assert(mini_receive(&s,527,&hb));
 struct mini_frame stop=command(MINI_STOP,0,0);stop.boot=0;assert(mini_receive(&s,528,&stop));assert(s.fault&&!s.output);
 uint8_t bytes[MINI_FRAME_BYTES];mini_encode(&hb,bytes);struct mini_frame decoded;
 assert(mini_decode(bytes,&decoded)&&decoded.sequence==8&&decoded.epoch==3);
 for(unsigned n=0;n<MINI_FRAME_BYTES*8;n++){bytes[n/8]^=(uint8_t)(1u<<(n%8));assert(!mini_decode(bytes,&decoded));bytes[n/8]^=(uint8_t)(1u<<(n%8));}
 /* Clock wraps safely; nonce/epoch exhaustion fails closed. */
 mini_init(&s,42);mini_tick(&s,UINT32_MAX-50,MINI_REQUIRED);hb.sequence=1;hb.epoch=1;
 assert(mini_receive(&s,UINT32_MAX-40,&hb));mini_tick(&s,UINT32_MAX-30,MINI_REQUIRED|MINI_LOCAL_BUTTON);
 arm.sequence=2;arm.epoch=1;assert(mini_receive(&s,UINT32_MAX-20,&arm));mini_tick(&s,20,MINI_REQUIRED);assert(s.output);
 s.epoch=UINT32_MAX;mini_tick(&s,21,MINI_REQUIRED&~MINI_DOCKED);assert(s.boot==0&&!s.output);
 puts("MCU supervisor host tests: protocol CRC/replay, local rearm, grant/heartbeat expiry, stop, detach, boot/epoch and timer wrap passed (LED-only bench logic).");
}
