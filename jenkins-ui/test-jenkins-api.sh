#!/bin/bash

# Jenkins Build Trigger Test Script
# This script tests the Jenkins API call format

set -e

echo "🧪 Jenkins Build Trigger Test"
echo "=============================="
echo ""

# Configuration
JENKINS_URL="${JENKINS_URL:-http://localhost:8080}"
JENKINS_USER="${JENKINS_USER:-admin}"
JENKINS_TOKEN="${JENKINS_TOKEN:-your_token}"
JOB_NAME="${JOB_NAME:-demo}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "Configuration:"
echo "  Jenkins URL: $JENKINS_URL"
echo "  Job Name: $JOB_NAME"
echo "  Username: $JENKINS_USER"
echo ""

# Function to test build trigger
test_build_trigger() {
    echo "📤 Testing build trigger..."
    
    # Create test ZIP file
    echo "Creating test ZIP file..."
    mkdir -p /tmp/test-app
    echo "console.log('test');" > /tmp/test-app/server.js
    cd /tmp/test-app
    zip -q -r /tmp/test-app.zip .
    cd - > /dev/null
    
    # Convert to base64
    BASE64_FILE=$(base64 -i /tmp/test-app.zip | tr -d '\n')
    
    # Clean up
    rm -rf /tmp/test-app /tmp/test-app.zip
    
    echo "Base64 file size: ${#BASE64_FILE} bytes"
    echo ""
    
    # Prepare JSON payload
    JSON_PAYLOAD=$(cat <<EOF
{
  "jobName": "$JOB_NAME",
  "parameters": [
    {"name": "SANDBOX_URL", "value": "http://sandbox:9000"},
    {"name": "SANDBOX_TOKEN", "value": ""},
    {"name": "SANDBOX_HOST_FOR_TEST", "value": "sandbox"},
    {"name": "APP_ZIP", "file": "$BASE64_FILE"},
    {"name": "NEXUS_RAW_DIRECTORY", "value": "demo2"},
    {"name": "ZAP_SCAN_TYPE", "value": "baseline"},
    {"name": "RUN_JMETER", "value": "false"}
  ]
}
EOF
)
    
    echo "Sending request to Jenkins..."
    echo "Endpoint: $JENKINS_URL/job/$JOB_NAME/build"
    echo ""
    
    # Make request
    RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
        -u "$JENKINS_USER:$JENKINS_TOKEN" \
        -H "Content-Type: application/json" \
        -X POST \
        "$JENKINS_URL/job/$JOB_NAME/build" \
        -d "$JSON_PAYLOAD")
    
    # Extract HTTP code
    HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
    BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE:")
    
    echo "Response:"
    echo "  HTTP Code: $HTTP_CODE"
    
    if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
        echo -e "  ${GREEN}✅ Build triggered successfully!${NC}"
        echo ""
        echo "Check Jenkins at: $JENKINS_URL/job/$JOB_NAME/"
        return 0
    else
        echo -e "  ${RED}❌ Build trigger failed${NC}"
        echo "  Response body:"
        echo "$BODY" | sed 's/^/    /'
        return 1
    fi
}

# Function to check Jenkins connectivity
check_jenkins() {
    echo "🔍 Checking Jenkins connectivity..."
    
    RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
        -u "$JENKINS_USER:$JENKINS_TOKEN" \
        "$JENKINS_URL/api/json")
    
    HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "  ${GREEN}✅ Connected to Jenkins${NC}"
        echo ""
        return 0
    else
        echo -e "  ${RED}❌ Cannot connect to Jenkins${NC}"
        echo "  HTTP Code: $HTTP_CODE"
        echo ""
        return 1
    fi
}

# Function to check job exists
check_job() {
    echo "🔍 Checking if job exists..."
    
    RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
        -u "$JENKINS_USER:$JENKINS_TOKEN" \
        "$JENKINS_URL/job/$JOB_NAME/api/json")
    
    HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "  ${GREEN}✅ Job '$JOB_NAME' found${NC}"
        echo ""
        return 0
    else
        echo -e "  ${RED}❌ Job '$JOB_NAME' not found${NC}"
        echo "  HTTP Code: $HTTP_CODE"
        echo ""
        return 1
    fi
}

# Run tests
echo "Running tests..."
echo ""

if check_jenkins && check_job; then
    if test_build_trigger; then
        echo ""
        echo -e "${GREEN}✅ All tests passed!${NC}"
        exit 0
    else
        echo ""
        echo -e "${RED}❌ Build trigger test failed${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ Prerequisites check failed${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Ensure Jenkins is running"
    echo "  2. Verify JENKINS_URL is correct"
    echo "  3. Check username and token"
    echo "  4. Verify job name exists"
    exit 1
fi
