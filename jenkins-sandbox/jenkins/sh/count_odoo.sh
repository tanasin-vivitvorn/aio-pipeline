#!/bin/bash

ADDONS_DIR=${1:-"./addons"}
OUTPUT="reports/odoo_inventory.txt"

mkdir -p reports

echo "========================================" | tee $OUTPUT
echo "  Odoo View & Field Inventory"            | tee -a $OUTPUT
echo "  Generated: $(date)"                     | tee -a $OUTPUT
echo "========================================" | tee -a $OUTPUT

TOTAL_SCREENS=0
TOTAL_FIELDS=0

# ─────────────────────────────────────────────
# extract_views FILE
# Prints: VIEW_NAME|MODEL|TYPE|INHERIT|field1,field2,...
#
# TYPE resolved by priority:
#   1. <field name="type">form</field>     explicit metadata
#   2. arch root element <form> <tree>     standard views
#   3. inherit_id ref name heuristic       inherit views
#   4. xpath expr content                  inherit fallback
# ─────────────────────────────────────────────
extract_views() {
    local file="$1"
    awk '
    BEGIN {
        in_view=0; in_arch=0; in_field_tag=0
        v_name=""; v_model=""; v_type=""; v_inherit=""
        fields=""; tag_buf=""
    }

    /<record[^>]*model="ir\.ui\.view"/ {
        in_view=1; in_arch=0; in_field_tag=0
        v_name=""; v_model=""; v_type=""; v_inherit=""
        fields=""; tag_buf=""
    }

    in_view && !in_arch {
        if ($0 ~ /name="name"/ && $0 ~ />.*<\/field>/) {
            val=$0; gsub(/.*name="name"[^>]*>/, "", val)
            gsub(/<\/field>.*/, "", val); v_name=val
        }
        if ($0 ~ /name="model"/ && $0 ~ />.*<\/field>/) {
            val=$0; gsub(/.*name="model"[^>]*>/, "", val)
            gsub(/<\/field>.*/, "", val); v_model=val
        }
        if ($0 ~ /name="type"/ && $0 ~ />.*<\/field>/) {
            val=$0; gsub(/.*name="type"[^>]*>/, "", val)
            gsub(/<\/field>.*/, "", val); v_type=val
        }
        # Detect inherit_id and derive type from ref naming convention
        if ($0 ~ /name="inherit_id"/) {
            v_inherit="yes"
            if ($0 ~ /ref="[^"]*"/) {
                ref=$0; gsub(/.*ref="/, "", ref); gsub(/".*$/, "", ref)
                if      (ref ~ /[_.]form$/ || ref ~ /form[_.]view/ || ref ~ /view[_.]form/ || ref ~ /_form_/) v_type="form"
                else if (ref ~ /[_.]tree$/ || ref ~ /tree[_.]view/ || ref ~ /view[_.]tree/ || ref ~ /_tree_/) v_type="tree"
                else if (ref ~ /[_.]list$/ || ref ~ /list[_.]view/ || ref ~ /view[_.]list/)                   v_type="list"
                else if (ref ~ /[_.]kanban$/ || ref ~ /kanban[_.]view/ || ref ~ /view[_.]kanban/)             v_type="kanban"
                else if (ref ~ /[_.]search$/ || ref ~ /search[_.]view/ || ref ~ /view[_.]search/)             v_type="search"
            }
        }
    }

    in_view && /name="arch"/ { in_arch=1; next }

    # Type from arch root element (standard views)
    in_arch && v_type == "" {
        if ($0 ~ /^[[:space:]]*<form[[:space:]>]/)   v_type="form"
        if ($0 ~ /^[[:space:]]*<tree[[:space:]>]/)   v_type="tree"
        if ($0 ~ /^[[:space:]]*<list[[:space:]>]/)   v_type="list"
        if ($0 ~ /^[[:space:]]*<kanban[[:space:]>]/) v_type="kanban"
        if ($0 ~ /^[[:space:]]*<search[[:space:]>]/) v_type="search"
    }

    # Type from xpath expr (inherit fallback)
    in_arch && v_type == "" && $0 ~ /expr="/ {
        expr=$0; gsub(/.*expr="/, "", expr); gsub(/".*$/, "", expr)
        if      (expr ~ /\/\/form/)   v_type="form"
        else if (expr ~ /\/\/tree/)   v_type="tree"
        else if (expr ~ /\/\/kanban/) v_type="kanban"
    }

    in_arch && !in_field_tag {
        if ($0 ~ /<field/) {
            if ($0 ~ /name="arch"/) next
            in_field_tag=1; tag_buf=$0
        }
    }

    in_arch && in_field_tag {
        if (tag_buf != $0) tag_buf = tag_buf " " $0
        if (tag_buf ~ /\/>/ || tag_buf ~ /<field[^>]*>/) {
            fname=tag_buf
            gsub(/.*name="/, "", fname); gsub(/".*$/, "", fname)
            gsub(/^[[:space:]]+/, "", fname); gsub(/[[:space:]]+$/, "", fname)
            # Skip self-closing position-anchor fields
            is_anchor=0
            if (tag_buf ~ /position="/ && tag_buf ~ /\/>/) is_anchor=1
            if (fname != "" && fname != "arch" && !is_anchor) {
                fields = fields (fields=="" ? "" : ",") fname
            }
            in_field_tag=0; tag_buf=""
        }
    }

    in_view && /<\/record>/ {
        if (v_name != "") {
            if (v_inherit == "yes" && v_type == "") v_type="inherit"
            print v_name "|" v_model "|" v_type "|" v_inherit "|" fields
        }
        in_view=0; in_arch=0; in_field_tag=0
        v_name=""; v_model=""; v_type=""; v_inherit=""
        fields=""; tag_buf=""
    }
    ' "$file"
}

type_label() {
    local t="$1" inherit="$2" suffix=""
    [ "$inherit" = "yes" ] && suffix=" (inherited)"
    case "$t" in
        form)      echo "Form Screen$suffix"   ;;
        tree|list) echo "List Screen$suffix"   ;;
        kanban)    echo "Kanban Screen$suffix"  ;;
        search)    echo "Search Filter$suffix"  ;;
        inherit)   echo "Inherit View"          ;;
        *)         echo "View ($t)$suffix"      ;;
    esac
}

type_is_screen() {
    case "$1" in
        form|tree|list|kanban) return 0 ;;
        *) return 1 ;;
    esac
}

# ─────────────────────────────────────────────
# Main loop — grouped by module
# ─────────────────────────────────────────────
XML_LIST=$(mktemp)
find "$ADDONS_DIR" -name "*.xml" \
    | xargs grep -l 'model="ir.ui.view"' 2>/dev/null \
    | sort > "$XML_LIST"

CURRENT_MODULE=""

while IFS= read -r xml_file; do
    REL_PATH=$(echo "$xml_file" | sed "s|$ADDONS_DIR/||")
    MODULE=$(echo "$REL_PATH" | cut -d'/' -f1)

    if [ "$MODULE" != "$CURRENT_MODULE" ]; then
        echo ""                                    | tee -a $OUTPUT
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a $OUTPUT
        echo "  Module: $MODULE"                   | tee -a $OUTPUT
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a $OUTPUT
        CURRENT_MODULE="$MODULE"
    fi

    VIEW_LIST=$(mktemp)
    extract_views "$xml_file" > "$VIEW_LIST"

    while IFS='|' read -r V_NAME V_MODEL V_TYPE V_INHERIT V_FIELDS; do
        [ -z "$V_NAME" ] && continue

        LABEL=$(type_label "$V_TYPE" "$V_INHERIT")
        IS_SCREEN=false
        type_is_screen "$V_TYPE" && IS_SCREEN=true

        if $IS_SCREEN; then
            ICON="📄"
            TOTAL_SCREENS=$((TOTAL_SCREENS + 1))
        else
            ICON="🔍"
        fi

        echo ""                                    | tee -a $OUTPUT
        echo "$ICON Screen    : $V_NAME"           | tee -a $OUTPUT
        echo "   Type      : $LABEL"               | tee -a $OUTPUT
        echo "   Model     : $V_MODEL"             | tee -a $OUTPUT
        echo "   File      : $REL_PATH"            | tee -a $OUTPUT

        FIELD_COUNT=0
        if [ -n "$V_FIELDS" ]; then
            OLD_IFS="$IFS"
            IFS=','
            for FNAME in $V_FIELDS; do
                FNAME=$(echo "$FNAME" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
                [ -z "$FNAME" ] && continue
                echo "   ├─ $FNAME"                | tee -a $OUTPUT
                FIELD_COUNT=$((FIELD_COUNT + 1))
                if $IS_SCREEN; then
                    TOTAL_FIELDS=$((TOTAL_FIELDS + 1))
                fi
            done
            IFS="$OLD_IFS"
        fi

        echo "   └─ Total fields: $FIELD_COUNT"    | tee -a $OUTPUT

    done < "$VIEW_LIST"
    rm -f "$VIEW_LIST"

done < "$XML_LIST"
rm -f "$XML_LIST"

echo ""                                            | tee -a $OUTPUT
echo "========================================"    | tee -a $OUTPUT
echo "  SUMMARY"                                   | tee -a $OUTPUT
echo "  Total Screens : $TOTAL_SCREENS"            | tee -a $OUTPUT
echo "  Total Fields  : $TOTAL_FIELDS"             | tee -a $OUTPUT
echo "  Note: 🔍 search and inherit views"         | tee -a $OUTPUT
echo "        are listed but not counted"          | tee -a $OUTPUT
echo "========================================"    | tee -a $OUTPUT

echo "ODOO_SCREENS=$TOTAL_SCREENS" >> reports/.summary_env
echo "ODOO_FIELDS=$TOTAL_FIELDS"   >> reports/.summary_env
