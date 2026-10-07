# deploy/scripts/go.sh — à sourcer (bash 3.2 de macOS compris).
# Règle du parc : toute écriture hors du dépôt (Docker Hub, rpi1, cluster, proxy .60) demande un GO sur la commande
# EXACTE ; un refus ARRÊTE tout (la page composant doit exister avant d'agir : on ne continue pas sans elle).
#   go "ce qui va être écrit" "commande exacte, telle qu'elle sera lancée"
go() {
  local r=""
  echo
  echo "── Écriture hors du dépôt : $1"
  printf '%s\n' "$2" | sed 's/^/   │ /'
  read -r -p "GO ? [o/N] " r </dev/tty || true
  case "$r" in o|O|oui|OUI) return 0 ;; *) echo "Pas de GO : arrêt, rien n'a été écrit." >&2; exit 1 ;; esac
}
