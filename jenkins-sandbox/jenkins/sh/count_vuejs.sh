#!/bin/bash

SRC_DIR=${1:-"./src"}
OUTPUT="reports/vuejs_inventory.txt"

mkdir -p reports

echo "========================================" | tee $OUTPUT
echo "  VueJS Screen & Field Inventory" | tee -a $OUTPUT
echo "  Generated: $(date)" | tee -a $OUTPUT
echo "========================================" | tee -a $OUTPUT

TOTAL_SCREENS=0
TOTAL_FIELDS=0

while IFS= read -r vue_file; do
    SCREEN_NAME=$(basename "$vue_file" | sed 's/\.vue$//')
    REL_PATH=$(echo "$vue_file" | sed "s|$SRC_DIR/||")

    if echo "$vue_file" | grep -qE '/(views|pages)/'; then
        SCREEN_LABEL="📄 Screen"
    else
        SCREEN_LABEL="🧩 Component"
    fi

    echo "" | tee -a $OUTPUT
    echo "$SCREEN_LABEL : $SCREEN_NAME" | tee -a $OUTPUT
    echo "   File      : $REL_PATH" | tee -a $OUTPUT

    FIELD_COUNT=0

    while IFS= read -r match; do
        LINENO_VAL=$(echo "$match" | cut -d: -f1)
        CONTENT=$(echo "$match" | cut -d: -f2-)

        TAG=$(echo "$CONTENT" | grep -oE '<(input|select|textarea|el-input|el-select|v-select|b-form-input|b-form-select|ElInput|ElSelect)' | sed 's/<//' | head -1)

        # Extract v-model using sed
        FIELD_NAME=$(echo "$CONTENT" | sed -n 's/.*v-model="\([^"]*\)".*/\1/p' | head -1)
        [ -z "$FIELD_NAME" ] && FIELD_NAME=$(echo "$CONTENT" | sed -n "s/.*v-model='\([^']*\)'.*/\1/p" | head -1)
        [ -z "$FIELD_NAME" ] && FIELD_NAME=$(echo "$CONTENT" | sed -n 's/.*\bname="\([^"]*\)".*/\1/p' | head -1)
        [ -z "$FIELD_NAME" ] && FIELD_NAME=$(echo "$CONTENT" | sed -n 's/.*\bid="\([^"]*\)".*/\1/p' | head -1)

        [ -z "$TAG" ] && continue

        if [ -n "$FIELD_NAME" ]; then
            echo "   ├─ [$TAG] v-model: $FIELD_NAME  (line $LINENO_VAL)" | tee -a $OUTPUT
        else
            echo "   ├─ [$TAG] name: (unnamed)  (line $LINENO_VAL)" | tee -a $OUTPUT
        fi

        FIELD_COUNT=$((FIELD_COUNT + 1))
        TOTAL_FIELDS=$((TOTAL_FIELDS + 1))
    done < <(grep -nE '<(input|select|textarea|el-input|el-select|v-select|b-form-input|ElInput|ElSelect)' "$vue_file" 2>/dev/null)

    echo "   └─ Total fields: $FIELD_COUNT" | tee -a $OUTPUT
    TOTAL_SCREENS=$((TOTAL_SCREENS + 1))

done < <(find "$SRC_DIR" -type f -name "*.vue" | grep -vE 'node_modules|\.test\.|\.spec\.')

echo "" | tee -a $OUTPUT
echo "========================================" | tee -a $OUTPUT
echo "  SUMMARY" | tee -a $OUTPUT
echo "  Total Screens : $TOTAL_SCREENS" | tee -a $OUTPUT
echo "  Total Fields  : $TOTAL_FIELDS" | tee -a $OUTPUT
echo "========================================" | tee -a $OUTPUT

echo "VUE_SCREENS=$TOTAL_SCREENS" >> reports/.summary_env
echo "VUE_FIELDS=$TOTAL_FIELDS"   >> reports/.summary_env
