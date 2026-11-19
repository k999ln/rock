/* Pico 2 bench supervisor. GP7 is an LED/test-logic output, not a laser/motor power driver. */
#include <stdio.h>
#include "pico/stdlib.h"
#include "pico/rand.h"
#include "hardware/watchdog.h"
#include "supervisor.h"
static uint16_t inputs(void) {uint16_t bits=0;for(unsigned p=2;p<=6;p++)if(gpio_get(p))bits|=(uint16_t)(1u<<(p-2));if(gpio_get(8))bits|=MINI_LOCAL_BUTTON;return bits;}
int main(void) {
 gpio_init(7);gpio_put(7,0);gpio_set_dir(7,GPIO_OUT);
 for(unsigned p=2;p<=8;p++){if(p==7)continue;gpio_init(p);gpio_set_dir(p,GPIO_IN);gpio_pull_down(p);}
 stdio_init_all();watchdog_enable(1000,false);
 uint32_t boot=get_rand_32();if(!boot)boot=1;
 struct mini_supervisor state;mini_init(&state,boot);
 uint8_t packet[MINI_FRAME_BYTES],tx[MINI_FRAME_BYTES];unsigned used=0;uint32_t last_report=0,report_sequence=0;
 for(;;){
  uint32_t now=to_ms_since_boot(get_absolute_time());mini_tick(&state,now,inputs());
  for(unsigned count=0;count<64;count++){
   int c=getchar_timeout_us(0);if(c==PICO_ERROR_TIMEOUT)break;
   if(used==0&&c!='M')continue;
   if(used==1&&c!='N'){used=(c=='M')?1u:0u;continue;}
   packet[used++]=(uint8_t)c;
   if(used==MINI_FRAME_BYTES){struct mini_frame frame;if(mini_decode(packet,&frame))mini_receive(&state,now,&frame);used=0;}
  }
  mini_tick(&state,now,inputs());gpio_put(7,state.output);
  if((uint32_t)(now-last_report)>=50u){
   struct mini_frame frame={.boot=state.boot,.sequence=++report_sequence,.epoch=state.epoch,.flags=mini_status(&state),.kind=MINI_STATUS};
   mini_encode(&frame,tx);for(unsigned i=0;i<MINI_FRAME_BYTES;i++)putchar_raw(tx[i]);last_report=now;
  }
  watchdog_update();sleep_ms(1);
 }
}
