#!/bin/bash

SRC_DIR=${1:-"./src/main"}
OUTPUT="reports/spring_inventory.txt"

mkdir -p reports

echo "========================================" | tee $OUTPUT
echo "  Spring Endpoint & Field Inventory" | tee -a $OUTPUT
echo "  Generated: $(date)" | tee -a $OUTPUT
echo "========================================" | tee -a $OUTPUT

TOTAL_CONTROLLERS=0
TOTAL_ENDPOINTS=0
TOTAL_FIELDS=0

# ── Controllers & Endpoints ──────────────────────
while IFS= read -r java_file; do
    REL_PATH=$(echo "$java_file" | sed "s|$SRC_DIR/||")
    CLASS_NAME=$(basename "$java_file" .java)

    grep -qE '@(RestController|Controller)' "$java_file" || continue

    BASE_PATH=$(grep -oE '@RequestMapping\("[^"]*"\)' "$java_file" | sed 's/@RequestMapping("//;s/")//' | head -1)
    [ -z "$BASE_PATH" ] && BASE_PATH="/"

    echo "" | tee -a $OUTPUT
    echo "🌐 Controller : $CLASS_NAME" | tee -a $OUTPUT
    echo "   Base Path  : $BASE_PATH" | tee -a $OUTPUT
    echo "   File       : $REL_PATH" | tee -a $OUTPUT

    ENDPOINT_COUNT=0

    while IFS= read -r match; do
        LINENO_VAL=$(echo "$match" | cut -d: -f1)
        CONTENT=$(echo "$match" | cut -d: -f2-)

        HTTP_METHOD=$(echo "$CONTENT" | grep -oE '@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)' | sed 's/@//' | head -1)
        ENDPOINT_PATH=$(echo "$CONTENT" | sed -n 's/.*"\([^"]*\)".*/\1/p' | head -1)
        [ -z "$ENDPOINT_PATH" ] && ENDPOINT_PATH="/"

        echo "   ├─ [$HTTP_METHOD] $BASE_PATH$ENDPOINT_PATH  (line $LINENO_VAL)" | tee -a $OUTPUT
        ENDPOINT_COUNT=$((ENDPOINT_COUNT + 1))
        TOTAL_ENDPOINTS=$((TOTAL_ENDPOINTS + 1))
    done < <(grep -nE '@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\(' "$java_file")

    echo "   └─ Total endpoints: $ENDPOINT_COUNT" | tee -a $OUTPUT
    TOTAL_CONTROLLERS=$((TOTAL_CONTROLLERS + 1))

done < <(find "$SRC_DIR" -name "*.java" | sort)

echo "" | tee -a $OUTPUT

# ── DTOs & Request Bodies ────────────────────────
echo "----------------------------------------" | tee -a $OUTPUT
echo "  DTOs & Request Body Fields" | tee -a $OUTPUT
echo "----------------------------------------" | tee -a $OUTPUT

while IFS= read -r java_file; do
    REL_PATH=$(echo "$java_file" | sed "s|$SRC_DIR/||")
    CLASS_NAME=$(basename "$java_file" .java)

    echo "$CLASS_NAME" | grep -qiE '(Dto|DTO|Request|Response|Form|Body)' || continue

    echo "" | tee -a $OUTPUT
    echo "📦 Class : $CLASS_NAME" | tee -a $OUTPUT
    echo "   File  : $REL_PATH" | tee -a $OUTPUT

    FIELD_COUNT=0

    while IFS= read -r match; do
        LINENO_VAL=$(echo "$match" | cut -d: -f1)
        CONTENT=$(echo "$match" | cut -d: -f2-)

        # Extract: private <Type> <fieldName>;
        FIELD_TYPE=$(echo "$CONTENT" | sed -n 's/.*private[[:space:]]\{1,\}\([^[:space:]]\{1,\}\)[[:space:]]\{1,\}.*/\1/p' | head -1)
        FIELD_NAME=$(echo "$CONTENT" | sed -n 's/.*private[[:space:]]\{1,\}[^[:space:]]\{1,\}[[:space:]]\{1,\}\([^[:space:];]\{1,\}\).*/\1/p' | head -1)

        [ -z "$FIELD_NAME" ] && continue

        echo "   ├─ [$FIELD_TYPE] $FIELD_NAME  (line $LINENO_VAL)" | tee -a $OUTPUT
        FIELD_COUNT=$((FIELD_COUNT + 1))
        TOTAL_FIELDS=$((TOTAL_FIELDS + 1))
    done < <(grep -nE 'private[[:space:]]+[^[:space:]]+[[:space:]]+[^[:space:];]+[[:space:]]*;' "$java_file")

    echo "   └─ Total fields: $FIELD_COUNT" | tee -a $OUTPUT

done < <(find "$SRC_DIR" -name "*.java" | sort)

echo "" | tee -a $OUTPUT
echo "========================================" | tee -a $OUTPUT
echo "  SUMMARY" | tee -a $OUTPUT
echo "  Total Controllers : $TOTAL_CONTROLLERS" | tee -a $OUTPUT
echo "  Total Endpoints   : $TOTAL_ENDPOINTS" | tee -a $OUTPUT
echo "  Total DTO Fields  : $TOTAL_FIELDS" | tee -a $OUTPUT
echo "========================================" | tee -a $OUTPUT

echo "SPRING_CONTROLLERS=$TOTAL_CONTROLLERS" >> reports/.summary_env
echo "SPRING_ENDPOINTS=$TOTAL_ENDPOINTS"     >> reports/.summary_env
echo "SPRING_FIELDS=$TOTAL_FIELDS"           >> reports/.summary_env
