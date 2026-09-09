# POSIX mount-table parser. The production wrapper supplies /proc/mounts.
rock_mount_matches() {
  [ "$#" -eq 4 ] || return 2
  rock_match=1
  while IFS=' ' read -r rock_source rock_point rock_type rock_options rock_unused; do
    [ "$rock_point" = "$1" ] || continue
    # A later mount at the same point supersedes an earlier matching entry.
    rock_match=1
    [ "$2" = '-' ] || [ "$rock_source" = "$2" ] || continue
    [ "$rock_type" = "$3" ] || continue
    rock_required=$4
    rock_match=0
    while [ -n "$rock_required" ]; do
      rock_option=${rock_required%%,*}
      [ -n "$rock_option" ] || { rock_match=1; break; }
      case ",$rock_options," in
        *",$rock_option,"*) ;;
        *) rock_match=1; break ;;
      esac
      case "$rock_required" in
        *,*) rock_required=${rock_required#*,} ;;
        *) rock_required='' ;;
      esac
    done
  done
  return "$rock_match"
}
