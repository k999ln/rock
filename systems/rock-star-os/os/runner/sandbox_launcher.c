/* Fixed finite-worker sandbox launcher. PUBLIC DEVELOPMENT, no setuid installation.
 * Operator supplies two trusted source paths at service startup, never wire input.
 * Linux headers provide architecture-specific syscall numbers at compile time.
 */
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <stddef.h>
#include <signal.h>
#include <sys/mman.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <unistd.h>

#define DENY(n) BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K, (n), 0, 1), BPF_STMT(BPF_RET|BPF_K, SECCOMP_RET_ERRNO|EPERM)
static void limit(int resource, rlim_t value) { struct rlimit r = {value,value}; if (setrlimit(resource,&r)) { perror("setrlimit"); exit(70); } }
static void checked_file(const char *path) { struct stat st; if (path[0]!='/' || lstat(path,&st) || !S_ISREG(st.st_mode) || (st.st_mode&0022)) { fputs("untrusted fixed worker path\n",stderr); exit(70); } }
int main(int argc,char **argv) {
    if (argc!=3 || getuid()==0 || geteuid()!=getuid() || getegid()!=getgid()) { fputs("nonroot operator launcher requires two fixed paths\n",stderr); return 70; }
    checked_file(argv[1]); checked_file(argv[2]);
    if (prctl(PR_SET_PDEATHSIG,SIGKILL) || getppid()==1 || prctl(PR_SET_NO_NEW_PRIVS,1,0,0,0)) { perror("process constraints"); return 70; }
    limit(RLIMIT_CORE,0); limit(RLIMIT_AS,256*1024*1024); limit(RLIMIT_CPU,2);
    limit(RLIMIT_FSIZE,1024*1024); limit(RLIMIT_NOFILE,64); limit(RLIMIT_NPROC,64);
    struct sock_filter filter[] = {
        BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,arch)),
#if defined(__aarch64__)
        BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,AUDIT_ARCH_AARCH64,1,0),
#elif defined(__x86_64__)
        BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,AUDIT_ARCH_X86_64,1,0),
#else
#error unsupported runner architecture
#endif
        BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_KILL_PROCESS),
        BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,nr)),
        DENY(__NR_socket), DENY(__NR_socketpair), DENY(__NR_ptrace), DENY(__NR_mount),
        DENY(__NR_umount2), DENY(__NR_unshare), DENY(__NR_setns), DENY(__NR_clone),
#ifdef __NR_clone3
        DENY(__NR_clone3),
#endif
#ifdef __NR_fork
        DENY(__NR_fork),
#endif
#ifdef __NR_vfork
        DENY(__NR_vfork),
#endif
        DENY(__NR_bpf), DENY(__NR_keyctl), DENY(__NR_add_key), DENY(__NR_request_key),
#ifdef __NR_userfaultfd
        DENY(__NR_userfaultfd),
#endif
        BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ALLOW)
    };
    int fd = memfd_create("runner-seccomp",MFD_ALLOW_SEALING);
    if (fd<0 || write(fd,filter,sizeof(filter))!=sizeof(filter) || lseek(fd,0,SEEK_SET)<0 ||
        fcntl(fd,F_ADD_SEALS,F_SEAL_WRITE|F_SEAL_GROW|F_SEAL_SHRINK|F_SEAL_SEAL)<0) { perror("seccomp filter"); return 70; }
    char number[32]; snprintf(number,sizeof(number),"%d",fd);
    char *args[] = {"/usr/bin/bwrap","--unshare-all","--unshare-user","--die-with-parent","--new-session","--cap-drop","ALL",
        "--disable-userns","--ro-bind","/usr","/usr","--ro-bind","/lib","/lib",
        "--ro-bind",argv[1],"/recipe_worker.py","--ro-bind",argv[2],"/runner_entry.py",
        "--proc","/proc","--dev","/dev","--tmpfs","/tmp","--dir","/data","--dir","/run",
        "--chdir","/tmp","--hostname","rock-remote-tool","--clearenv","--setenv","PATH","/usr/bin",
        "--setenv","LANG","C.UTF-8","--setenv","HOME","/tmp","--seccomp",number,
        "--","/usr/bin/python3","-I","-B","/runner_entry.py",NULL};
    execv(args[0],args); perror("fixed bwrap launch"); return 70;
}
