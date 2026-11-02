# Preserved GitHub migration lineage

Exact bytes from GitHub main `7bbb4b27ab6ca3b1d42bef4643c9dda8cb8ba0c6`, retained during the avoado.si source merge. This directory is never a production migration source. In particular, `drizzle-main/0026_home_eve_linux_runtime.sql` must not run against avoado.si: it contains a community visibility update and overlapping ALTERs.

Only the idempotent CREATE definitions from drizzle/0030 and 0031 are used to construct synthetic local test databases. Active `drizzle/` and `drizzle-main/` remain byte-identical to the already published v141 lineage.
