#!/bin/bash

SRC_DIR=${1:-"./src"}
OUTPUT="reports/reactjs_inventory.txt"

mkdir -p reports

echo "========================================" | tee $OUTPUT
echo "  ReactJS Screen & Field Inventory"       | tee -a $OUTPUT
echo "  Generated: $(date)"                     | tee -a $OUTPUT
echo "========================================" | tee -a $OUTPUT

TOTAL_SCREENS=0
TOTAL_FIELDS=0

# ─────────────────────────────────────────────
# extract_routes FILE
# Prints: LINENO:ROUTE_PATH:COMPONENT_NAME
# Handles JSX <Route> and object { path: ... }
# Both inline and multi-line patterns
# ─────────────────────────────────────────────
extract_routes() {
    local file="$1"
    awk 'BEGIN { in_route=0; buffer=""; line_start=0 }
    {
        line = $0

        if (!in_route) {
            # Match: <Route alone or with attributes, OR { path:
            if (line ~ /^[[:space:]]*<Route([[:space:]]|$)/ || \
                line ~ /\{[[:space:]]*path[[:space:]]*:/) {
                in_route   = 1
                line_start = NR
                buffer     = line
            }
        } else {
            buffer = buffer " " line
        }

        if (in_route) {
            closed = 0
            if (buffer ~ /<Route/ && buffer ~ /\/>/) closed = 1
            if (buffer ~ /\{[[:space:]]*path/ && buffer ~ /\}/) closed = 1

            if (closed) {
                # ── Extract path ──────────────────────
                route_path = "(unknown)"
                if (buffer ~ /path="[^"]*"/) {
                    route_path = buffer
                    gsub(/.*path="/, "", route_path)
                    gsub(/".*$/, "", route_path)
                } else if (buffer ~ /path: *"[^"]*"/) {
                    route_path = buffer
                    gsub(/.*path: *"/, "", route_path)
                    gsub(/".*$/, "", route_path)
                }
                # single-quote path:
                n = split(buffer, a, /path: *'"'"'/)
                if (n > 1) {
                    route_path = a[2]
                    gsub(/'"'"'.*/, "", route_path)
                }

                # ── Extract component name ────────────
                component = "(unknown)"
                if (buffer ~ /element=\{<[A-Za-z]/) {
                    component = buffer
                    gsub(/.*element=\{</, "", component)
                    gsub(/[ \t\/>\}].*/, "", component)
                } else if (buffer ~ /element: *<[A-Za-z]/) {
                    component = buffer
                    gsub(/.*element: *</, "", component)
                    gsub(/[ \t\/>\}].*/, "", component)
                }

                print line_start ":" route_path ":" component
                in_route = 0; buffer = ""; line_start = 0
            }
        }
    }' "$file"
}

# ─────────────────────────────────────────────
# extract_fields FILE
# Prints: LINENO:TAG:FIELDNAME
# Buffers multi-line tags before extracting
# ─────────────────────────────────────────────
extract_fields() {
    local file="$1"
    awk 'BEGIN { in_tag=0; buffer=""; tag_start=0 }
    {
        line = $0

        if (!in_tag) {
            if (line ~ /^[[:space:]]*<(input|select|textarea|Checkbox|Radio|Switch|DatePicker|TimePicker|Autocomplete)([[:space:]\/>;]|$)/) {
                in_tag    = 1
                tag_start = NR
                buffer    = line
            }
        } else {
            buffer = buffer " " line
        }

        if (in_tag && buffer ~ />/) {
            tag = buffer
            gsub(/^[^<]*</, "", tag)
            gsub(/[ \t\/>].*/, "", tag)

            fname = "(unnamed)"
            if (buffer ~ /name="[^"]*"/) {
                fname = buffer
                gsub(/.*name="/, "", fname)
                gsub(/".*$/, "", fname)
            } else if (buffer ~ /id="[^"]*"/) {
                fname = buffer
                gsub(/.*id="/, "", fname)
                gsub(/".*$/, "", fname)
            }

            print tag_start ":" tag ":" fname
            in_tag=0; buffer=""; tag_start=0
        }
    }' "$file"
}

# ─────────────────────────────────────────────
# find_component_file SRC_DIR COMPONENT_NAME
# Locates a component file by its name
# ─────────────────────────────────────────────
find_component_file() {
    local dir="$1"
    local name="$2"
    find "$dir" -type f \( \
        -name "${name}.tsx" -o \
        -name "${name}.jsx" -o \
        -name "${name}.js"  \
    \) | grep -vE 'node_modules|\.test\.|\.spec\.|__tests__' | head -1
}

# ─────────────────────────────────────────────
# find_router_files SRC_DIR
# Finds files that define routes
# ─────────────────────────────────────────────
find_router_files() {
    local dir="$1"
    find "$dir" -type f \( -name "*.tsx" -o -name "*.jsx" -o -name "*.js" \) \
        | grep -vE 'node_modules|\.test\.|\.spec\.|__tests__' \
        | xargs grep -l -E '(<Route|createBrowserRouter|createHashRouter|useRoutes)' 2>/dev/null
}

# ─────────────────────────────────────────────
# Main
# 1. Find all router files
# 2. Extract all Route path + component pairs
# 3. For each route, find and scan the component file
# ─────────────────────────────────────────────
ROUTER_FILES=$(mktemp)
find_router_files "$SRC_DIR" > "$ROUTER_FILES"

ROUTE_LIST=$(mktemp)
while IFS= read -r router_file; do
    extract_routes "$router_file" >> "$ROUTE_LIST"
done < "$ROUTER_FILES"
rm -f "$ROUTER_FILES"

# Deduplicate by route path
DEDUP_LIST=$(mktemp)
sort -t: -k2,2 -u "$ROUTE_LIST" > "$DEDUP_LIST"
rm -f "$ROUTE_LIST"

while IFS=: read -r LINENO_VAL ROUTE_PATH COMPONENT; do
    [ -z "$ROUTE_PATH" ] && continue
    [ "$ROUTE_PATH" = "(unknown)" ] && continue

    echo ""                              | tee -a $OUTPUT
    echo "📄 Screen    : $ROUTE_PATH"    | tee -a $OUTPUT
    echo "   Component : $COMPONENT"     | tee -a $OUTPUT

    FIELD_COUNT=0
    COMP_FILE=""

    if [ "$COMPONENT" != "(unknown)" ]; then
        COMP_FILE=$(find_component_file "$SRC_DIR" "$COMPONENT")
    fi

    if [ -n "$COMP_FILE" ]; then
        echo "   File      : $(echo "$COMP_FILE" | sed "s|$SRC_DIR/||")" | tee -a $OUTPUT

        FIELD_LIST=$(mktemp)
        extract_fields "$COMP_FILE" > "$FIELD_LIST"

        while IFS=: read -r FLINE FTAG FNAME; do
            [ -z "$FTAG" ] && continue
            echo "   ├─ [$FTAG] name: $FNAME  (line $FLINE)" | tee -a $OUTPUT
            FIELD_COUNT=$((FIELD_COUNT + 1))
            TOTAL_FIELDS=$((TOTAL_FIELDS + 1))
        done < "$FIELD_LIST"

        rm -f "$FIELD_LIST"
    else
        echo "   File      : (component file not found)" | tee -a $OUTPUT
    fi

    echo "   └─ Total fields: $FIELD_COUNT" | tee -a $OUTPUT
    TOTAL_SCREENS=$((TOTAL_SCREENS + 1))

done < "$DEDUP_LIST"

rm -f "$DEDUP_LIST"

echo ""                                  | tee -a $OUTPUT
echo "========================================"  | tee -a $OUTPUT
echo "  SUMMARY"                         | tee -a $OUTPUT
echo "  Total Screens : $TOTAL_SCREENS"   | tee -a $OUTPUT
echo "  Total Fields  : $TOTAL_FIELDS"    | tee -a $OUTPUT
echo "========================================"  | tee -a $OUTPUT

echo "REACT_SCREENS=$TOTAL_SCREENS" >> reports/.summary_env
echo "REACT_FIELDS=$TOTAL_FIELDS"   >> reports/.summary_env
