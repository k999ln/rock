#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <linux/memfd.h>
#include <seccomp.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

/* Only the immutable finite recipe interpreter and an isolation diagnostic
 * are entry points. No caller-controlled command, path, bind mount or env. */
static void fail(const char *message) { perror(message); exit(125); }
static void limit(int kind, rlim_t value) {
    struct rlimit r = {value, value};
    if (setrlimit(kind, &r)) fail("resource limit");
}

int main(int argc, char **argv) {
    pid_t owner = getppid();
    if (owner == 1 || prctl(PR_SET_PDEATHSIG, SIGKILL) || getppid() != owner) {
        fputs("Platform parent is no longer alive\n", stderr); return 125;
    }
    const char *script;
    if (argc != 2 || (strcmp(argv[1], "recipe") && strcmp(argv[1], "probe"))) {
        fputs("Expected recipe or probe\n", stderr); return 125;
    }
    if (getuid() != 1002 || geteuid() != 1002) {
        fputs("Only the platform service can launch tools\n", stderr); return 125;
    }
    script = !strcmp(argv[1], "recipe")
        ? "/usr/lib/rock-platform/blackberryrock/recipe_worker.py"
        : "/usr/lib/rock-platform/sandbox-probe.py";
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)) fail("no_new_privs");
    limit(RLIMIT_CORE, 0);
    limit(RLIMIT_AS, 256 * 1024 * 1024);
    limit(RLIMIT_CPU, 2);
    limit(RLIMIT_FSIZE, 1024 * 1024);
    limit(RLIMIT_NOFILE, 64);
    limit(RLIMIT_NPROC, 64);

    scmp_filter_ctx filter = seccomp_init(SCMP_ACT_ALLOW);
    if (!filter) fail("seccomp_init");
    /* Mount/PID/user/net namespaces define visibility; seccomp also prevents
     * creating sockets, descendants, or replacing those namespace boundaries.
     * This is a restricted recipe policy, not a generic application runtime. */
    const char *denied[] = {"socket", "socketpair", "ptrace", "bpf", "mount",
        "umount2", "pivot_root", "unshare", "setns", "clone", "clone3", "fork",
        "vfork", "keyctl", "add_key", "request_key", "userfaultfd",
        "perf_event_open", "process_vm_readv", "process_vm_writev", "reboot",
        "kexec_load", "kexec_file_load", "init_module", "finit_module",
        "delete_module", "open_by_handle_at", "name_to_handle_at", "io_uring_setup",
        "fsopen", "fsconfig", "fsmount", "move_mount", "open_tree", "mount_setattr"};
    for (size_t i = 0; i < sizeof(denied) / sizeof(denied[0]); ++i) {
        int nr = seccomp_syscall_resolve_name(denied[i]);
        if (nr == __NR_SCMP_ERROR) continue;
        int rc = seccomp_rule_add(filter, SCMP_ACT_ERRNO(EPERM), nr, 0);
        if (rc < 0) { errno = -rc; fail("seccomp_rule_add"); }
    }
    int fd = memfd_create("rock-recipe-policy", MFD_ALLOW_SEALING);
    if (fd < 0) fail("memfd_create");
    if (seccomp_export_bpf(filter, fd) < 0) fail("seccomp_export_bpf");
    seccomp_release(filter);
    if (lseek(fd, 0, SEEK_SET) < 0 || fcntl(fd, F_ADD_SEALS,
        F_SEAL_WRITE | F_SEAL_GROW | F_SEAL_SHRINK | F_SEAL_SEAL) < 0) fail("seal policy");
    char descriptor[24];
    snprintf(descriptor, sizeof descriptor, "%d", fd);
    struct stat network_namespace;
    if (stat("/proc/self/ns/net", &network_namespace)) fail("inspect parent network namespace");
    char network_identity[32];
    snprintf(network_identity, sizeof network_identity, "%llu", (unsigned long long)network_namespace.st_ino);
    if (clearenv() || setenv("PATH", "/usr/bin:/bin", 1) || setenv("LANG", "C.UTF-8", 1))
        fail("environment");
    char *const command[] = {"/usr/bin/bwrap", "--unshare-all", "--unshare-user", "--die-with-parent",
        "--new-session", "--cap-drop", "ALL", "--disable-userns", "--uid", "65534",
        "--gid", "65534", "--ro-bind", "/usr", "/usr", "--ro-bind", "/lib", "/lib",
        "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--dir", "/run",
        "--dir", "/data", "--chdir", "/tmp", "--hostname", "rock-tool",
        "--clearenv", "--setenv", "PATH", "/usr/bin", "--setenv", "LANG", "C.UTF-8",
        "--setenv", "ROCK_OUTER_NETNS", network_identity,
        "--setenv", "HOME", "/tmp", "--seccomp", descriptor, "--",
        "/usr/bin/python3", "-I", "-B", (char *)script, NULL};
    execv(command[0], command);
    fail("exec bubblewrap");
}
