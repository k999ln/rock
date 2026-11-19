#include "supervisor.h"
static void put32(uint8_t *p,uint32_t v) { for(unsigned i=0;i<4;i++) p[i]=(uint8_t)(v>>(8*i)); }
static uint32_t get32(const uint8_t *p) { uint32_t v=0;for(unsigned i=0;i<4;i++)v|=(uint32_t)p[i]<<(8*i);return v; }
uint16_t mini_crc(const uint8_t *p,size_t n) {
 uint16_t crc=0xffffu;for(size_t i=0;i<n;i++){crc^=(uint16_t)p[i]<<8;for(unsigned j=0;j<8;j++)crc=(crc&0x8000u)?(uint16_t)((crc<<1)^0x1021u):(uint16_t)(crc<<1);}return crc;
}
void mini_encode(const struct mini_frame *f,uint8_t p[MINI_FRAME_BYTES]) {
 p[0]='M';p[1]='N';p[2]=1;p[3]=f->kind;put32(p+4,f->boot);put32(p+8,f->sequence);put32(p+12,f->epoch);
 p[16]=(uint8_t)f->flags;p[17]=(uint8_t)(f->flags>>8);uint16_t c=mini_crc(p,18);p[18]=(uint8_t)c;p[19]=(uint8_t)(c>>8);
}
bool mini_decode(const uint8_t p[MINI_FRAME_BYTES],struct mini_frame *f) {
 if(p[0]!='M'||p[1]!='N'||p[2]!=1||p[3]<MINI_STATUS||p[3]>MINI_STOP||mini_crc(p,18)!=((uint16_t)p[18]|((uint16_t)p[19]<<8)))return false;
 f->kind=p[3];f->boot=get32(p+4);f->sequence=get32(p+8);f->epoch=get32(p+12);f->flags=(uint16_t)p[16]|((uint16_t)p[17]<<8);return true;
}
static void stop(struct mini_supervisor *s) {s->output=false;s->fault=true;s->local_armed=false;s->arm_valid=false;}
static bool ready(const struct mini_supervisor *s,uint32_t now) {return s->boot!=0&&(s->inputs&MINI_REQUIRED)==MINI_REQUIRED&&s->heartbeat_valid&&(uint32_t)(now-s->heartbeat_at)<MINI_HEARTBEAT_MS;}
void mini_init(struct mini_supervisor *s,uint32_t boot) { *s=(struct mini_supervisor){.boot=boot,.epoch=1,.fault=true}; }
void mini_tick(struct mini_supervisor *s,uint32_t now,uint16_t inputs) {
 bool dock=(inputs&MINI_DOCKED)!=0,button=(inputs&MINI_LOCAL_BUTTON)!=0;
 s->inputs=inputs&63u;
 if(s->heartbeat_valid&&(uint32_t)(now-s->heartbeat_at)>=MINI_HEARTBEAT_MS)s->heartbeat_valid=false;
 if(s->arm_valid&&(uint32_t)(now-s->arm_at)>=MINI_ARM_MS)s->arm_valid=false;
 if(s->dock_known&&s->last_dock!=dock){if(s->epoch==UINT32_MAX)s->boot=0;else s->epoch++;stop(s);s->heartbeat_valid=false;}
 s->dock_known=true;s->last_dock=dock;
 if(!ready(s,now))stop(s);
 else if(button&&!s->last_button){s->local_armed=true;s->fault=false;}
 s->last_button=button;
 s->output=ready(s,now)&&s->local_armed&&!s->fault&&s->arm_valid&&(uint32_t)(now-s->arm_at)<MINI_ARM_MS;
}
bool mini_receive(struct mini_supervisor *s,uint32_t now,const struct mini_frame *f) {
 if(f->kind==MINI_STOP){stop(s);return true;}
 if(s->boot==0||f->boot!=s->boot||f->epoch!=s->epoch||f->flags!=0||f->sequence==0||
    (s->seen_sequence&&f->sequence<=s->sequence))return false;
 if(f->kind==MINI_HEARTBEAT){s->heartbeat_at=now;s->heartbeat_valid=true;}
 else if(f->kind==MINI_ARM){if(!ready(s,now)||!s->local_armed||s->fault)return false;s->arm_at=now;s->arm_valid=true;}
 else return false;
 s->seen_sequence=true;s->sequence=f->sequence;mini_tick(s,now,s->inputs);return true;
}
uint16_t mini_status(const struct mini_supervisor *s) {return s->inputs|(s->output?MINI_OUTPUT_ON:0u)|(s->fault?MINI_FAULT:0u);}
