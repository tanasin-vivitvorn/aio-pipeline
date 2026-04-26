#!/bin/bash

# Test File Parameter Upload to Jenkins
# Tests the multipart/form-data file upload implementation

set -e

echo "📤 Jenkins File Upload Test"
echo "==========================="
echo ""

# Configuration
JENKINS_URL="${JENKINS_URL:-http://localhost:8080}"
JENKINS_USER="${JENKINS_USER:-admin}"
JENKINS_TOKEN="${JENKINS_TOKEN:-your_token}"
JOB_NAME="${JOB_NAME:-demo}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "Configuration:"
echo "  Jenkins URL: $JENKINS_URL"
echo "  Job Name: $JOB_NAME"
echo ""

# Create test ZIP file
echo "📦 Creating test ZIP file..."
mkdir -p /tmp/test-app
cat > /tmp/test-app/server.js << 'EOF'
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Hello!'));
app.listen(3000);
EOF

cat > /tmp/test-app/package.json << 'EOF'
{
  "name": "test-app",
  "version": "1.0.0",
  "dependencies": {
    "express": "^4.18.0"
  }
}
EOF

cat > /tmp/test-app/Dockerfile << 'EOF'
FROM node:18-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY server.js .
EXPOSE 3000
CMD ["node", "server.js"]
EOF

cd /tmp/test-app
zip -q -r /tmp/app.zip .
cd - > /dev/null

FILE_SIZE=$(stat -f%z /tmp/app.zip 2>/dev/null || stat -c%s /tmp/app.zip)
echo "  ✅ Created app.zip ($FILE_SIZE bytes)"
echo ""

# Test multipart upload
echo "🚀 Testing multipart file upload..."
echo ""

# Create JSON parameter
JSON_PARAM=$(cat <<'EOF'
{
  "parameter": [
    {"name": "SANDBOX_URL", "value": "http://sandbox:9000"},
    {"name": "SANDBOX_TOKEN", "value": "test-token"},
    {"name": "SANDBOX_HOST_FOR_TEST", "value": "sandbox"},
    {"name": "APP_ZIP", "file": "file0"},
    {"name": "NEXUS_RAW_DIRECTORY", "value": "demo2"},
    {"name": "ZAP_SCAN_TYPE", "value": "baseline"},
    {"name": "RUN_JMETER", "value": "false"}
  ]
}
EOF
)

echo "Sending multipart request..."
echo "  Endpoint: $JENKINS_URL/job/$JOB_NAME/build/api/json"
echo "  File: /tmp/app.zip"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    -u "$JENKINS_USER:$JENKINS_TOKEN" \
    -X POST \
    -F "json=$JSON_PARAM" \
    -F "file0=@/tmp/app.zip" \
    "$JENKINS_URL/job/$JOB_NAME/build/api/json")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE:")

echo "Response:"
echo "  HTTP Code: $HTTP_CODE"

if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
    echo -e "  ${GREEN}✅ Build triggered successfully!${NC}"
    echo ""
    echo "🎉 File upload test PASSED"
    echo ""
    echo "Next steps:"
    echo "  1. Check Jenkins: $JENKINS_URL/job/$JOB_NAME/"
    echo "  2. Verify the build received the ZIP file"
    echo "  3. Check build console output for file processing"
    
    # Cleanup
    rm -rf /tmp/test-app /tmp/app.zip
    exit 0
else
    echo -e "  ${RED}❌ Build trigger failed${NC}"
    echo "  Response:"
    echo "$BODY" | sed 's/^/    /'
    echo ""
    
    # Additional debugging
    echo "🔍 Debugging Information:"
    echo ""
    echo "Testing basic connectivity..."
    curl -s -u "$JENKINS_USER:$JENKINS_TOKEN" \
        "$JENKINS_URL/api/json" > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo "  ✅ Jenkins is reachable"
    else
        echo "  ❌ Cannot connect to Jenkins"
    fi
    
    echo ""
    echo "Checking job exists..."
    JOB_CHECK=$(curl -s -w "%{http_code}" -o /dev/null \
        -u "$JENKINS_USER:$JENKINS_TOKEN" \
        "$JENKINS_URL/job/$JOB_NAME/api/json")
    
    if [ "$JOB_CHECK" = "200" ]; then
        echo "  ✅ Job '$JOB_NAME' exists"
    else
        echo "  ❌ Job '$JOB_NAME' not found (HTTP $JOB_CHECK)"
    fi
    
    # Cleanup
    rm -rf /tmp/test-app /tmp/app.zip
    exit 1
fi
