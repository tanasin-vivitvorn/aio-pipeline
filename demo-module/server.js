const express = require("express");
const path = require("path");

const app = express();
const port = Number(process.env.PORT || 8888);

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    name: "uploaded-app-demo",
    port,
    ts: new Date().toISOString(),
  });
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Demo app listening on 0.0.0.0:${port}`);
});
