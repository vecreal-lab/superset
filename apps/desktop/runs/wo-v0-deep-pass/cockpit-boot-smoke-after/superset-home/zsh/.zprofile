# Superset zsh profile wrapper
_superset_saved_env="$(export -p 2>/dev/null | grep ' SUPERSET_')"
_superset_home="${SUPERSET_ORIG_ZDOTDIR:-$HOME}"
export ZDOTDIR="$_superset_home"
[[ -f "$_superset_home/.zprofile" ]] && source "$_superset_home/.zprofile"
eval "$_superset_saved_env" 2>/dev/null || true
export ZDOTDIR='C:\Users\levyt\OneDrive\Documents\Software-Factory\vendor\superset-sh\apps\desktop\runs\wo-v0-deep-pass\cockpit-boot-smoke-after\superset-home\zsh'
