const express = require("express");
const multer = require("multer");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 9100);
const WORKDIR = process.env.WORKDIR || "/sandbox/workspace";
const TOKEN = process.env.SANDBOX_TOKEN;
if (!TOKEN) throw new Error("SANDBOX_TOKEN env var is required");
const PROJECT = process.env.COMPOSE_PROJECT_NAME || "sandboxproj";
const MAX_SPEC_BYTES = 1024 * 1024;

function auth(req, res, next) {
  const got = req.header("x-sandbox-token");
  if (!got || got !== TOKEN)
    return res.status(401).json({ error: "unauthorized" });
  next();
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", ...opts });
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
  });
}

// Like run() but captures stdout+stderr and returns them as a string
function runCaptured(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const chunks = [];
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
    p.stdout.on("data", (d) => chunks.push(d));
    p.stderr.on("data", (d) => chunks.push(d));
    p.on("close", (code) => {
      const output = Buffer.concat(chunks).toString();
      console.log(`[${cmd}] exit=${code}\n${output}`);
      resolve({ code, output });
    });
    cd;
  });
}

const COMPOSE_NAMES = new Set([
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
]);

function findComposeFile(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && COMPOSE_NAMES.has(entry.name)) return full;
    if (entry.isDirectory()) {
      const found = findComposeFile(full);
      if (found) return found;
    }
  }
  return null;
}

async function ensureCleanWorkspace() {
  await fsp.mkdir(WORKDIR, { recursive: true });

  // Clean old workspace contents (but keep folder)
  const entries = await fsp.readdir(WORKDIR).catch(() => []);
  for (const e of entries) {
    const full = path.join(WORKDIR, e);
    await fsp.rm(full, { recursive: true, force: true });
  }
}

async function getExposedPorts(project) {
  const { execSync } = require("child_process");

  // list containers of this compose project
  const ps = execSync(
    `docker ps --filter "label=com.docker.compose.project=${project}" --format "{{json .}}"`,
    { encoding: "utf-8" },
  );

  const lines = ps.trim().split("\n").filter(Boolean);

  const result = [];

  for (const line of lines) {
    const c = JSON.parse(line);

    // inspect container
    const inspect = JSON.parse(
      execSync(`docker inspect ${c.ID}`, { encoding: "utf-8" }),
    )[0];

    const ports = inspect.NetworkSettings.Ports || {};

    const mapped = [];

    for (const [containerPort, bindings] of Object.entries(ports)) {
      if (!bindings) continue;

      for (const b of bindings) {
        mapped.push({
          host: Number(b.HostPort),
          container: Number(containerPort.split("/")[0]),
          protocol: containerPort.split("/")[1],
          url: `http://localhost:${b.HostPort}`,
        });
      }
    }

    result.push({
      name:
        inspect.Config.Labels["com.docker.compose.service"] ||
        inspect.Name.replace("/", ""),
      container: c.Names,
      ports: mapped,
      state: inspect.State.Status,
    });
  }

  return result;
}

async function findSpecFileContent(workdir) {
  const testsDir = path.join(workdir, "tests");

  // If tests folder doesn't exist, just return null
  if (!fs.existsSync(testsDir) || !fs.statSync(testsDir).isDirectory()) {
    return null;
  }

  // Prefer explicit tests/test.spec.ts
  const preferred = path.join(testsDir, "test.spec.ts");
  if (fs.existsSync(preferred) && fs.statSync(preferred).isFile()) {
    const st = fs.statSync(preferred);
    if (st.size > MAX_SPEC_BYTES) {
      return {
        path: "tests/test.spec.ts",
        error: `spec file too large (${st.size} bytes > ${MAX_SPEC_BYTES})`,
      };
    }
    const content = await fsp.readFile(preferred, "utf8");
    return { path: "tests/test.spec.ts", content };
  }

  // Otherwise find the first *.spec.ts under /tests (non-recursive simple version)
  const entries = await fsp.readdir(testsDir, { withFileTypes: true });
  const candidates = entries
    .filter((e) => e.isFile() && e.name.endsWith(".spec.ts"))
    .map((e) => e.name)
    .sort();

  if (candidates.length === 0) return null;

  const chosen = path.join(testsDir, candidates[0]);
  const st = fs.statSync(chosen);
  if (st.size > MAX_SPEC_BYTES) {
    return {
      path: `tests/${candidates[0]}`,
      error: `spec file too large (${st.size} bytes > ${MAX_SPEC_BYTES})`,
    };
  }

  const content = await fsp.readFile(chosen, "utf8");
  return { path: `tests/${candidates[0]}`, content };
}

// Upload expects a ZIP that contains docker-compose.yml at root (or inside; we’ll extract and search)
const upload = multer({ dest: "/tmp" });

app.get("/health", (req, res) => res.json({ ok: true }));

/**
 * POST /api/upload
 * Header: x-sandbox-token: <TOKEN>
 * Form-data: file=<zip>
 */
app.post("/api/upload", auth, upload.single("file"), async (req, res) => {
  if (!req.file)
    return res
      .status(400)
      .json({ error: "file required (form-data key: file)" });

  try {
    await ensureCleanWorkspace();

    const zipPath = req.file.path;
    // Derive project dir from the original zip filename (strip extension)
    const zipBasename = path.basename(
      req.file.originalname,
      path.extname(req.file.originalname),
    );
    const composeDir = path.join(WORKDIR, zipBasename);
    await fsp.mkdir(composeDir, { recursive: true });

    // Extract directly into the named subfolder
    await run("unzip", ["-o", zipPath, "-d", composeDir]);

    // Recursively find the first compose file under composeDir
    const composeFile = findComposeFile(composeDir);
    const projectDir = composeFile ? path.dirname(composeFile) : null;

    if (!composeFile) {
      return res.status(400).json({
        error: `compose file not found anywhere under ${composeDir}`,
        hint: "ZIP must contain docker-compose.yml somewhere in its directory tree",
      });
    }

    console.log(`Using compose file: ${composeFile} (cwd: ${projectDir})`);

    // Deploy with docker compose (plugin) first, fallback docker-compose
    const env = { ...process.env, COMPOSE_PROJECT_NAME: PROJECT };

    try {
      await run(
        "docker",
        ["compose", "-f", composeFile, "up", "-d", "--remove-orphans"],
        { cwd: projectDir, env },
      );
    } catch (e) {
      // fallback for older setups
      await run(
        "docker-compose",
        ["-f", composeFile, "up", "-d", "--remove-orphans"],
        { cwd: projectDir, env },
      );
    }
    const services = await getExposedPorts(PROJECT);
    const testSpec = await findSpecFileContent(projectDir);

    res.json({
      ok: true,
      deployed: true,
      project: PROJECT,
      services,
      testSpec,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    // cleanup temp upload
    if (req.file?.path) fs.rmSync(req.file.path, { force: true });
  }
});

/**
 * POST /api/destroy
 * Header: x-sandbox-token: <TOKEN>
 *
 * Default: tears down ONLY the deployed compose project resources.
 * Optional JSON: { "nukeAll": true } to remove *all* containers/images (dangerous).
 */
app.post("/api/destroy", auth, async (req, res) => {
  const nukeAll = !!req.body?.nukeAll;
  const logs = [];

  try {
    const env = { ...process.env, COMPOSE_PROJECT_NAME: PROJECT };

    // Find compose file using the same recursive search as upload
    const composeFile = findComposeFile(WORKDIR);
    const projectDir = composeFile ? path.dirname(composeFile) : null;

    if (composeFile) {
      console.log(`[destroy] compose file: ${composeFile}`);
      logs.push(`compose file: ${composeFile}`);

      const downArgs = [
        "-f",
        composeFile,
        "down",
        "--rmi",
        "all",
        "--volumes",
        "--remove-orphans",
      ];

      let result = await runCaptured("docker", ["compose", ...downArgs], {
        cwd: projectDir,
        env,
      });
      logs.push(`docker compose down (exit=${result.code}):\n${result.output}`);

      if (result.code !== 0) {
        // fallback to docker-compose
        result = await runCaptured("docker-compose", downArgs, {
          cwd: projectDir,
          env,
        });
        logs.push(
          `docker-compose down fallback (exit=${result.code}):\n${result.output}`,
        );
      }
    } else {
      logs.push(
        `no compose file found under ${WORKDIR} — skipping compose down`,
      );
      console.log(`[destroy] ${logs[logs.length - 1]}`);
    }

    if (nukeAll) {
      for (const cmd of [
        "docker ps -aq | xargs -r docker rm -f",
        "docker images -aq | xargs -r docker rmi -f",
        "docker system prune -af --volumes",
      ]) {
        const r = await runCaptured("bash", ["-lc", cmd]);
        logs.push(`${cmd} (exit=${r.code}):\n${r.output}`);
      }
    }

    // Clean workspace
    await ensureCleanWorkspace();
    logs.push("workspace cleaned");

    res.json({ ok: true, destroyed: true, nukeAll, logs });
  } catch (err) {
    console.error("[destroy] error:", err);
    res.status(500).json({ error: err.message, logs });
  }
});

app.listen(PORT, () => {
  console.log(`Sandbox deployer listening on :${PORT}`);
});
