#!/bin/bash

# ================================================
#  Orchestrator — Multi-Framework Inventory
#  Usage: bash orchestrate.sh [options]
#
#  Options:
#    --react    <dir>    Run ReactJS scanner
#    --angular  <dir>    Run AngularJS scanner
#    --vue      <dir>    Run VueJS scanner
#    --odoo     <dir>    Run Odoo scanner
#    --spring   <dir>    Run Spring scanner
#    --all               Run all with default dirs
# ================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_DIR="reports"
SUMMARY_ENV="$REPORT_DIR/.summary_env"
FINAL_REPORT="$REPORT_DIR/inventory_summary.txt"

mkdir -p "$REPORT_DIR"
> "$SUMMARY_ENV"  # reset summary env

# ── Defaults ─────────────────────────────────────
REACT_DIR="./src"
ANGULAR_DIR="./src"
VUE_DIR="./src"
ODOO_DIR="./addons"
SPRING_DIR="./src/main"

RUN_REACT=false
RUN_ANGULAR=false
RUN_VUE=false
RUN_ODOO=false
RUN_SPRING=false

# ── Argument Parsing ─────────────────────────────
if [ $# -eq 0 ]; then
    echo "Usage: bash orchestrate.sh [--react <dir>] [--angular <dir>] [--vue <dir>] [--odoo <dir>] [--spring <dir>] [--all]"
    exit 1
fi

while [[ $# -gt 0 ]]; do
    case "$1" in
        --react)    RUN_REACT=true;   [ -n "$2" ] && [[ "$2" != --* ]] && { REACT_DIR="$2"; shift; }   ;;
        --angular)  RUN_ANGULAR=true; [ -n "$2" ] && [[ "$2" != --* ]] && { ANGULAR_DIR="$2"; shift; } ;;
        --vue)      RUN_VUE=true;     [ -n "$2" ] && [[ "$2" != --* ]] && { VUE_DIR="$2"; shift; }     ;;
        --odoo)     RUN_ODOO=true;    [ -n "$2" ] && [[ "$2" != --* ]] && { ODOO_DIR="$2"; shift; }    ;;
        --spring)   RUN_SPRING=true;  [ -n "$2" ] && [[ "$2" != --* ]] && { SPRING_DIR="$2"; shift; }  ;;
        --all)
            RUN_REACT=true; RUN_ANGULAR=true; RUN_VUE=true
            RUN_ODOO=true;  RUN_SPRING=true
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
    shift
done

# ── Helper ───────────────────────────────────────
run_scanner() {
    local LABEL="$1"
    local SCRIPT="$2"
    local DIR="$3"

    echo ""
    echo "▶ Running $LABEL scanner on: $DIR"

    if [ ! -f "$SCRIPT_DIR/$SCRIPT" ]; then
        echo "  ⚠ Script not found: $SCRIPT_DIR/$SCRIPT — skipping"
        return
    fi

    if [ ! -d "$DIR" ]; then
        echo "  ⚠ Directory not found: $DIR — skipping"
        return
    fi

    bash "$SCRIPT_DIR/$SCRIPT" "$DIR"

    if [ $? -eq 0 ]; then
        echo "  ✔ $LABEL scan complete"
    else
        echo "  ✘ $LABEL scan failed"
    fi
}

# ── Run Scanners ─────────────────────────────────
START_TIME=$(date +%s)

echo "========================================"
echo "  Multi-Framework Inventory Orchestrator"
echo "  Started: $(date)"
echo "========================================"

$RUN_REACT   && run_scanner "ReactJS"   "count_reactjs.sh"   "$REACT_DIR"
$RUN_ANGULAR && run_scanner "AngularJS" "count_angularjs.sh" "$ANGULAR_DIR"
$RUN_VUE     && run_scanner "VueJS"     "count_vuejs.sh"     "$VUE_DIR"
$RUN_ODOO    && run_scanner "Odoo"      "count_odoo.sh"      "$ODOO_DIR"
$RUN_SPRING  && run_scanner "Spring"    "count_spring.sh"    "$SPRING_DIR"

# ── Load Summary Env ──────────────────────────────
[ -f "$SUMMARY_ENV" ] && source "$SUMMARY_ENV"

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

# ── Final Summary Report ──────────────────────────
{
echo "========================================"
echo "  MULTI-FRAMEWORK INVENTORY SUMMARY"
echo "  Generated : $(date)"
echo "  Duration  : ${ELAPSED}s"
echo "========================================"

$RUN_REACT && echo "" && \
echo "  [ReactJS]" && \
echo "  Screens : ${REACT_SCREENS:-0}" && \
echo "  Fields  : ${REACT_FIELDS:-0}"

$RUN_ANGULAR && echo "" && \
echo "  [AngularJS]" && \
echo "  Screens : ${ANGULAR_SCREENS:-0}" && \
echo "  Fields  : ${ANGULAR_FIELDS:-0}"

$RUN_VUE && echo "" && \
echo "  [VueJS]" && \
echo "  Screens : ${VUE_SCREENS:-0}" && \
echo "  Fields  : ${VUE_FIELDS:-0}"

$RUN_ODOO && echo "" && \
echo "  [Odoo]" && \
echo "  Views   : ${ODOO_VIEWS:-0}" && \
echo "  Fields  : ${ODOO_FIELDS:-0}"

$RUN_SPRING && echo "" && \
echo "  [Spring]" && \
echo "  Controllers : ${SPRING_CONTROLLERS:-0}" && \
echo "  Endpoints   : ${SPRING_ENDPOINTS:-0}" && \
echo "  DTO Fields  : ${SPRING_FIELDS:-0}"

echo ""
echo "========================================"
echo "  Reports saved in: $REPORT_DIR/"
echo "========================================"
} | tee "$FINAL_REPORT"