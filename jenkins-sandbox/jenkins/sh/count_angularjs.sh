#!/bin/bash

SRC_DIR=${1:-"./src"}
OUTPUT="reports/angularjs_inventory.txt"

mkdir -p reports

echo "========================================" | tee $OUTPUT
echo "  AngularJS Screen & Field Inventory" | tee -a $OUTPUT
echo "  Generated: $(date)" | tee -a $OUTPUT
echo "========================================" | tee -a $OUTPUT

TOTAL_SCREENS=0
TOTAL_FIELDS=0

scan_html_file() {
    local html_file="$1"
    local label="$2"
    local REL_PATH
    REL_PATH=$(echo "$html_file" | sed "s|$SRC_DIR/||")
    SCREEN_NAME=$(basename "$html_file" | sed 's/\.component\.html$//;s/\.html$//')

    echo "" | tee -a $OUTPUT
    echo "$label : $SCREEN_NAME" | tee -a $OUTPUT
    echo "   File  : $REL_PATH" | tee -a $OUTPUT

    FIELD_COUNT=0

    while IFS= read -r match; do
        LINENO_VAL=$(echo "$match" | cut -d: -f1)
        CONTENT=$(echo "$match" | cut -d: -f2-)

        TAG=$(echo "$CONTENT" | grep -oE '<(input|select|textarea|mat-select|mat-checkbox|mat-radio-button|mat-datepicker|mat-slide-toggle)' | sed 's/<//' | head -1)

        # Extract formControlName, name, or id
        FIELD_NAME=$(echo "$CONTENT" | sed -n 's/.*formControlName="\([^"]*\)".*/\1/p' | head -1)
        [ -z "$FIELD_NAME" ] && FIELD_NAME=$(echo "$CONTENT" | sed -n 's/.*\bname="\([^"]*\)".*/\1/p' | head -1)
        [ -z "$FIELD_NAME" ] && FIELD_NAME=$(echo "$CONTENT" | sed -n 's/.*\bid="\([^"]*\)".*/\1/p' | head -1)
        # ngModel fallback
        [ -z "$FIELD_NAME" ] && FIELD_NAME=$(echo "$CONTENT" | sed -n 's/.*\[(ngModel)\]="\([^"]*\)".*/\1/p' | head -1)

        [ -z "$TAG" ] && continue

        if [ -n "$FIELD_NAME" ]; then
            echo "   ├─ [$TAG] name: $FIELD_NAME  (line $LINENO_VAL)" | tee -a $OUTPUT
        else
            echo "   ├─ [$TAG] name: (unnamed)  (line $LINENO_VAL)" | tee -a $OUTPUT
        fi

        FIELD_COUNT=$((FIELD_COUNT + 1))
        TOTAL_FIELDS=$((TOTAL_FIELDS + 1))
    done < <(grep -nE '<(input|select|textarea|mat-select|mat-checkbox|mat-radio-button|mat-datepicker|mat-slide-toggle)' "$html_file" 2>/dev/null)

    echo "   └─ Total fields: $FIELD_COUNT" | tee -a $OUTPUT
    TOTAL_SCREENS=$((TOTAL_SCREENS + 1))
}

# Component templates
while IFS= read -r html_file; do
    scan_html_file "$html_file" "📄 Screen"
done < <(find "$SRC_DIR" -type f -name "*.component.html" | grep -vE 'node_modules')

# Standalone templates
while IFS= read -r html_file; do
    echo "$html_file" | grep -q "component.html" && continue
    scan_html_file "$html_file" "📄 Screen (template)"
done < <(find "$SRC_DIR" -type f -name "*.html" | grep -vE 'node_modules|\.component\.html')

echo "" | tee -a $OUTPUT
echo "========================================" | tee -a $OUTPUT
echo "  SUMMARY" | tee -a $OUTPUT
echo "  Total Screens : $TOTAL_SCREENS" | tee -a $OUTPUT
echo "  Total Fields  : $TOTAL_FIELDS" | tee -a $OUTPUT
echo "========================================" | tee -a $OUTPUT

echo "ANGULAR_SCREENS=$TOTAL_SCREENS" >> reports/.summary_env
echo "ANGULAR_FIELDS=$TOTAL_FIELDS"   >> reports/.summary_env
