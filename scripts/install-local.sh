#!/bin/sh
set -eu

action=${1:-}
applications=${LARES_APPLICATIONS_DIR:-/Applications}
installed_app=$applications/Lares.app

case "$action" in
  install)
    artifact=${2:-}
    if [ ! -f "$artifact" ]; then
      echo "Lares DMG not found: $artifact" >&2
      exit 2
    fi
    case "$artifact" in
      *.dmg) ;;
      *)
        echo "Lares installer must be a local .dmg file" >&2
        exit 2
        ;;
    esac

    mount_dir=$(mktemp -d "${TMPDIR:-/tmp}/lares-mount.XXXXXX")
    mounted=0
    cleanup() {
      status=$?
      trap - EXIT HUP INT TERM
      if [ "$mounted" -eq 1 ]; then hdiutil detach "$mount_dir" >/dev/null 2>&1 || true; fi
      rmdir "$mount_dir" >/dev/null 2>&1 || true
      exit "$status"
    }
    trap cleanup EXIT HUP INT TERM

    hdiutil attach "$artifact" -nobrowse -readonly -mountpoint "$mount_dir"
    mounted=1
    if [ ! -d "$mount_dir/Lares.app" ]; then
      echo "Lares.app not found in DMG" >&2
      exit 2
    fi
    mkdir -p "$applications"
    ditto "$mount_dir/Lares.app" "$installed_app"
    hdiutil detach "$mount_dir"
    mounted=0
    rmdir "$mount_dir"
    trap - EXIT HUP INT TERM
    open "$installed_app"
    ;;
  uninstall)
    executable=$installed_app/Contents/MacOS/Lares
    if [ ! -x "$executable" ]; then
      echo "Installed Lares app not found: $installed_app" >&2
      exit 2
    fi
    exec "$executable" --uninstall
    ;;
  *)
    echo "Usage: install-local.sh install <local.dmg> | uninstall" >&2
    exit 2
    ;;
esac
