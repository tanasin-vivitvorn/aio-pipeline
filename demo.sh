#!/usr/bin/env bash
set -euo pipefail

# Creates a demo module ZIP that matches your Jenkins pipeline expectations:
# - Dockerfile at ZIP root
# - Node/Express app listens on $PORT (default 3000)
# - GET / returns 200, GET /health returns JSON
# - Optional playwright/ folder (pipeline auto-detects)
# - Optional jmeter/test.jmx (pipeline auto-detects)

APP_DIR="${1:-demo-module}"
ZIP_NAME="${2:-demo-module.zip}"

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/public" "$APP_DIR/playwright/tests" "$APP_DIR/jmeter"

cat > "$APP_DIR/Dockerfile" <<'EOF'
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
EOF

cat > "$APP_DIR/package.json" <<'EOF'
{
  "name": "uploaded-app-demo",
  "version": "1.0.0",
  "private": true,
  "type": "commonjs",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.19.2"
  }
}
EOF

cat > "$APP_DIR/server.js" <<'EOF'
const express = require("express");
const path = require("path");

const app = express();
const port = Number(process.env.PORT || 3000);

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    name: "uploaded-app-demo",
    port,
    ts: new Date().toISOString()
  });
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Demo app listening on 0.0.0.0:${port}`);
});
EOF

cat > "$APP_DIR/public/index.html" <<'EOF'
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Uploaded App Demo</title>
  </head>
  <body>
    <h1>Uploaded App Demo</h1>
    <p>If you see this, Jenkins “Run App Container” curl check should pass.</p>
    <p>Try <code>/health</code> too.</p>
  </body>
</html>
EOF

cat > "$APP_DIR/playwright/package.json" <<'EOF'
{
  "name": "demo-playwright",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.50.0",
    "typescript": "^5.4.0"
  }
}
EOF

cat > "$APP_DIR/playwright/playwright.config.ts" <<'EOF'
import { defineConfig } from "@playwright/test";

export default defineConfig({
  use: {
    baseURL: process.env.BASE_URL || "http://uploaded-app:3000"
  },
  reporter: [["html", { open: "never" }], ["list"]]
});
EOF

cat > "$APP_DIR/playwright/tests/smoke.spec.ts" <<'EOF'
import { test, expect } from "@playwright/test";

test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Uploaded App Demo/i);
  await expect(page.getByRole("heading", { name: "Uploaded App Demo" })).toBeVisible();
});

test("health endpoint works", async ({ request }) => {
  const res = await request.get("/health");
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json.ok).toBe(true);
});
EOF

cat > "$APP_DIR/jmeter/test.jmx" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Uploaded App Demo - Smoke" enabled="true">
      <stringProp name="TestPlan.comments">Simple HTTP smoke test for / and /health</stringProp>
      <boolProp name="TestPlan.functional_mode">false</boolProp>
      <boolProp name="TestPlan.tearDown_on_shutdown">true</boolProp>
      <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>

      <elementProp name="TestPlan.user_defined_variables" elementType="Arguments">
        <collectionProp name="Arguments.arguments">
          <elementProp name="HOST" elementType="Argument">
            <stringProp name="Argument.name">HOST</stringProp>
            <stringProp name="Argument.value">${__P(host,uploaded-app)}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
          <elementProp name="PORT" elementType="Argument">
            <stringProp name="Argument.name">PORT</stringProp>
            <stringProp name="Argument.value">${__P(port,3000)}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
        </collectionProp>
      </elementProp>
    </TestPlan>
    <hashTree>
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="TG - 5 users x 10 loops" enabled="true">
        <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
        <elementProp name="ThreadGroup.main_controller" elementType="LoopController">
          <boolProp name="LoopController.continue_forever">false</boolProp>
          <stringProp name="LoopController.loops">10</stringProp>
        </elementProp>
        <stringProp name="ThreadGroup.num_threads">5</stringProp>
        <stringProp name="ThreadGroup.ramp_time">5</stringProp>
        <boolProp name="ThreadGroup.scheduler">false</boolProp>
      </ThreadGroup>
      <hashTree>

        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="GET /" enabled="true">
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
            <collectionProp name="Arguments.arguments"/>
          </elementProp>
          <stringProp name="HTTPSampler.domain">${HOST}</stringProp>
          <stringProp name="HTTPSampler.port">${PORT}</stringProp>
          <stringProp name="HTTPSampler.protocol">http</stringProp>
          <stringProp name="HTTPSampler.path">/</stringProp>
          <stringProp name="HTTPSampler.method">GET</stringProp>
          <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
          <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
        </HTTPSamplerProxy>
        <hashTree/>

        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="GET /health" enabled="true">
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
            <collectionProp name="Arguments.arguments"/>
          </elementProp>
          <stringProp name="HTTPSampler.domain">${HOST}</stringProp>
          <stringProp name="HTTPSampler.port">${PORT}</stringProp>
          <stringProp name="HTTPSampler.protocol">http</stringProp>
          <stringProp name="HTTPSampler.path">/health</stringProp>
          <stringProp name="HTTPSampler.method">GET</stringProp>
          <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
          <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
        </HTTPSamplerProxy>
        <hashTree/>

      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>
EOF

# Create ZIP with Dockerfile at ZIP root:
rm -f "$ZIP_NAME"
(
  cd "$APP_DIR"
  zip -r "../$ZIP_NAME" .
)

echo "✅ Created demo module:"
echo " - Folder: $APP_DIR"
echo " - ZIP:    $ZIP_NAME"
echo ""
echo "Upload $ZIP_NAME to Jenkins as MODULE_ZIP."
echo "Optional local test:"
echo "  docker build -t uploaded-app:local $APP_DIR"
echo "  docker run --rm -e PORT=3000 -p 3000:3000 uploaded-app:local"
echo "  curl -i http://localhost:3000/"
echo "  curl -i http://localhost:3000/health"

