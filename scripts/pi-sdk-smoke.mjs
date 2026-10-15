import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  behaviorAssertions,
  EXTENSION_LOAD_ERROR_PATTERN,
  parseJsonLines,
  SDK_NAMES,
  UNHANDLED_ERROR_PATTERN,
  VERIFICATION_CONTRACT,
} from "./pi-sdk-smoke-contract.mjs";

const PROBE_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 1_000_000;
const root = resolve(import.meta.dirname, "..");
const reportPath = resolve(root, "docs/verification/pi-sdk-smoke.json");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = readJson(resolve(root, "package.json"));
const sdkVersions = Object.fromEntries(SDK_NAMES.map((name) => [
  name,
  readJson(resolve(root, "node_modules", name, "package.json")).version,
]));

for (const name of SDK_NAMES) {
  if (manifest.devDependencies?.[name] !== sdkVersions[name]) {
    throw new Error(`Smoke requires exact dev/test SDK pins for ${name}: installed ${sdkVersions[name]}`);
  }
}

const piManifest = readJson(resolve(root, "node_modules/@earendil-works/pi-coding-agent/package.json"));
const piCliPath = typeof piManifest.bin === "string" ? piManifest.bin : piManifest.bin?.pi;
if (!piCliPath) throw new Error("The pinned Pi SDK package does not declare its pi CLI entrypoint.");
const piCli = resolve(root, "node_modules/@earendil-works/pi-coding-agent", piCliPath);
const expectedModel = { provider: "router-smoke", id: "scheduled-model" };
const rpcArgs = [
  piCli,
  "--offline",
  "--no-session",
  "--no-tools",
  "--no-extensions",
  "--no-skills",
  "--no-context-files",
  "--no-prompt-templates",
  "--no-mcp",
  "-e",
  root,
  "--mode",
  "rpc",
];
const command = "npm run smoke:pi";

function safeEnvironment(agentDir) {
  return {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    HOME: agentDir,
    USERPROFILE: agentDir,
    PI_CODING_AGENT_DIR: agentDir,
    NO_COLOR: "1",
  };
}

function safeShellEnvironment(agentDir) {
  const env = {
    ...process.env,
    HOME: agentDir,
    USERPROFILE: agentDir,
    PI_CODING_AGENT_DIR: agentDir,
    NO_COLOR: "1",
  };
  for (const key of Object.keys(env)) {
    if (/(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key)) delete env[key];
  }
  return env;
}

function createFixture(invalidConfig = false) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "pi-scheduled-router-smoke-"));
  const projectDir = join(fixtureRoot, "project");
  const agentDir = join(fixtureRoot, "agent");
  const projectConfigDir = join(projectDir, ".pi");
  mkdirSync(projectConfigDir, { recursive: true });
  mkdirSync(agentDir, { recursive: true });

  const version = invalidConfig ? 2 : 1;
  const config = [
    `version: ${version}`,
    "timezone: UTC",
    "default:",
    "  provider: router-smoke",
    "  model: scheduled-model",
    "slots:",
    '  - from: "00:00"',
    '    to: "24:00"',
    "    provider: router-smoke",
    "    model: scheduled-model",
    "",
  ].join("\n");
  writeFileSync(join(projectConfigDir, "scheduled-router.yaml"), config, "utf8");
  writeFileSync(join(agentDir, "models.json"), `${JSON.stringify({
    providers: {
      "router-smoke": {
        baseUrl: "http://127.0.0.1:1/v1",
        api: "openai-completions",
        apiKey: "offline-smoke-only",
        models: [{
          id: expectedModel.id,
          name: "Isolated Scheduled Router Smoke Model",
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 8192,
          maxTokens: 1024,
        }],
      },
    },
  }, null, 2)}\n`, "utf8");

  return { fixtureRoot, projectDir, agentDir };
}

function redact(value, fixture) {
  let text = String(value ?? "");
  for (const [path, replacement] of [
    [root, "<checkout>"],
    [fixture.projectDir, "<isolated-project>"],
    [fixture.agentDir, "<isolated-agent-dir>"],
    [fixture.fixtureRoot, "<isolated-smoke-dir>"],
  ]) {
    const normalizedPath = path.startsWith("\\\\?\\") ? path.slice(4) : path;
    const candidates = [path, normalizedPath].flatMap((candidate) => [candidate, candidate.replaceAll("\\", "/")]);
    for (const candidate of new Set(candidates)) {
      text = text.split(candidate).join(replacement);
    }
  }
  return text;
}

function sanitizeResponses(responses, fixture) {
  function sanitize(value) {
    if (typeof value === "string") return redact(value, fixture);
    if (Array.isArray(value)) return value.map(sanitize);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitize(entry)]));
    }
    return value;
  }
  return responses.map(sanitize);
}

function runPi(requests, fixture) {
  const input = `${requests.map((request) => JSON.stringify(request)).join("\n")}\n`;
  const result = spawnSync(process.execPath, rpcArgs, {
    cwd: fixture.projectDir,
    env: safeEnvironment(fixture.agentDir),
    input,
    encoding: "utf8",
    timeout: PROBE_TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES,
    windowsHide: true,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const responses = sanitizeResponses(parseJsonLines(stdout), fixture);
  return {
    responses,
    stdout: responses.map((response) => JSON.stringify(response)).join("\n") + (responses.length ? "\n" : ""),
    stderr: redact(stderr, fixture),
    fullOutput: `${stdout}\n${stderr}`,
    exit_code: Number.isInteger(result.status) ? result.status : 1,
    timedOut: result.error?.code === "ETIMEDOUT",
    error: result.error ? redact(`${result.error.code ?? ""}: ${result.error.message}`, fixture) : null,
    signal: result.signal ?? null,
  };
}

function recordOutput(run) {
  return JSON.stringify({
    stdout: run.stdout,
    stderr: run.stderr,
    exit_code: run.exit_code,
    timed_out: run.timedOut,
    signal: run.signal,
    spawn_error: run.error,
  }, null, 2);
}

function runtimeAssertions(runs) {
  const outputs = runs.map((run) => run.fullOutput).join("\n");
  const timedOut = runs.some((run) => run.timedOut);
  const spawnError = runs.some((run) => run.error !== null);
  const nonzeroExit = runs.some((run) => run.exit_code !== 0);
  return [
    {
      id: "pi_process_exit",
      expected: `Every actual Pi process exits with status 0 within ${PROBE_TIMEOUT_MS}ms; deadline termination is failure.`,
      observed: JSON.stringify(runs.map(({ exit_code, timedOut: timeout, signal, error }) => ({ exit_code, timed_out: timeout, signal, error }))),
      passed: !timedOut && !spawnError && !nonzeroExit,
    },
    {
      id: "no_unhandled_errors",
      expected: "Captured Pi stdout/stderr contains no unhandled exceptions or shutdown errors.",
      observed: JSON.stringify({ matched: UNHANDLED_ERROR_PATTERN.test(outputs), captured_bytes: Buffer.byteLength(outputs, "utf8") }),
      passed: !UNHANDLED_ERROR_PATTERN.test(outputs),
    },
    {
      id: "no_extension_load_errors",
      expected: "Captured Pi stdout/stderr contains no extension loader errors.",
      observed: JSON.stringify({ matched: EXTENSION_LOAD_ERROR_PATTERN.test(outputs) }),
      passed: !EXTENSION_LOAD_ERROR_PATTERN.test(outputs),
    },
  ];
}

function makeCase(name, assertions, runs, evidence) {
  const combinedOutput = runs.map((run) => run.fullOutput).join("\n");
  const allAssertions = [...assertions, ...runtimeAssertions(runs)];
  return {
    name,
    command,
    exit_code: runs.at(-1)?.exit_code ?? 1,
    passed: allAssertions.every((item) => item.passed),
    evidence: evidence ?? JSON.stringify(runs.map(recordOutput), null, 2),
    assertions: allAssertions,
    hasUnhandledError: UNHANDLED_ERROR_PATTERN.test(combinedOutput),
    hasLoadError: EXTENSION_LOAD_ERROR_PATTERN.test(combinedOutput),
  };
}

function failedCase(name, error) {
  return {
    name,
    command,
    exit_code: 1,
    passed: false,
    evidence: `Harness setup/execution failed: ${String(error?.stack ?? error)}`,
    assertions: [{
      id: "probe_completed",
      expected: "The bounded actual Pi SDK smoke probe completes and records observations.",
      observed: String(error?.message ?? error),
      passed: false,
    }],
    hasUnhandledError: false,
    hasLoadError: name === "extension_load",
  };
}

async function runSafely(name, callback) {
  try {
    return await callback();
  } catch (error) {
    return failedCase(name, error);
  }
}

function runExtensionLoadCase() {
  const fixture = createFixture();
  try {
    const run = runPi([{ id: "load-commands", type: "get_commands" }], fixture);
    const assertions = behaviorAssertions("extension_load", {
      responses: run.responses,
      fullOutput: run.fullOutput,
      exit_code: run.exit_code,
    });
    return makeCase("extension_load", assertions, [run]);
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true });
  }
}

function runHappyPathCase() {
  const fixture = createFixture();
  try {
    const run = runPi([
      { id: "happy-state", type: "get_state" },
      { id: "happy-status", type: "prompt", message: "/scheduled:status" },
    ], fixture);
    const assertions = behaviorAssertions("happy_path", {
      responses: run.responses,
      fullOutput: run.fullOutput,
      exit_code: run.exit_code,
      expectedModel,
    });
    return makeCase("happy_path", assertions, [run]);
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true });
  }
}

function runErrorPathCase() {
  const fixture = createFixture(true);
  try {
    const run = runPi([
      { id: "error-status", type: "prompt", message: "/scheduled:status" },
    ], fixture);
    const assertions = behaviorAssertions("error_path", {
      responses: run.responses,
      fullOutput: run.fullOutput,
      exit_code: run.exit_code,
    });
    return makeCase("error_path", assertions, [run]);
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true });
  }
}

function runReloadCleanupCase() {
  const fixture = createFixture();
  try {
    const first = runPi([
      { id: "happy-state", type: "get_state" },
      { id: "happy-status", type: "prompt", message: "/scheduled:status" },
    ], fixture);
    const second = runPi([
      { id: "reload-commands", type: "get_commands" },
      { id: "reload-state", type: "get_state" },
      { id: "reload-status", type: "prompt", message: "/scheduled:status" },
    ], fixture);
    const initialAssertions = behaviorAssertions("happy_path", {
      responses: first.responses,
      fullOutput: first.fullOutput,
      exit_code: first.exit_code,
      expectedModel,
    });
    const assertions = behaviorAssertions("reload_cleanup", {
      responses: second.responses,
      fullOutput: `${first.fullOutput}\n${second.fullOutput}`,
      exit_code: { first: first.exit_code, second: second.exit_code },
      expectedModel,
    });
    assertions.push({
      id: "initial_process_functional",
      expected: "The first actual Pi process also selects the model and handles the scheduled status command before reload.",
      observed: JSON.stringify(initialAssertions),
      passed: initialAssertions.every((item) => item.passed),
    });
    return makeCase("reload_cleanup", assertions, [first, second], JSON.stringify({
      first_process: JSON.parse(recordOutput(first)),
      second_process: JSON.parse(recordOutput(second)),
    }, null, 2));
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true });
  }
}

function runHostShellCase() {
  const fixture = createFixture();
  try {
    const quote = (value) => `'${value.replaceAll("'", "''")}'`;
    let shell;
    let shellArgs;
    if (process.platform === "win32") {
      shell = resolve(process.env.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
      const psCommand = `& ${quote(process.execPath)} ${quote(piCli)} --no-extensions --version; exit $LASTEXITCODE`;
      shellArgs = ["-NoProfile", "-NonInteractive", "-Command", psCommand];
    } else {
      shell = "/bin/sh";
      shellArgs = ["-c", '"$1" "$2" --no-extensions --version', "pi-host-shell", process.execPath, piCli];
    }
    const result = spawnSync(shell, shellArgs, {
      cwd: root,
      env: safeShellEnvironment(fixture.agentDir),
      encoding: "utf8",
      timeout: PROBE_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    const fullOutput = {
      stdout: redact(result.stdout ?? "", fixture),
      stderr: redact(result.stderr ?? "", fixture),
    };
    const exitCode = Number.isInteger(result.status) ? result.status : 1;
    const run = {
      ...fullOutput,
      fullOutput: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      exit_code: exitCode,
      timedOut: result.error?.code === "ETIMEDOUT",
      error: result.error ? redact(`${result.error.code ?? ""}: ${result.error.message}`, fixture) : null,
      signal: result.signal ?? null,
    };
    const assertions = behaviorAssertions("host_shell", {
      responses: [],
      fullOutput,
      exit_code: exitCode,
      expectedVersion: sdkVersions["@earendil-works/pi-coding-agent"],
    });
    return makeCase("host_shell", assertions, [run]);
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true });
  }
}

const cases = [];
cases.push(await runSafely("extension_load", runExtensionLoadCase));
cases.push(await runSafely("happy_path", runHappyPathCase));
cases.push(await runSafely("error_path", runErrorPathCase));
cases.push(await runSafely("reload_cleanup", runReloadCleanupCase));
cases.push(await runSafely("host_shell", runHostShellCase));

const report = {
  schema_version: 1,
  verification_contract: VERIFICATION_CONTRACT,
  sdk_versions: sdkVersions,
  platform: process.platform,
  model_inference: "none; actual pinned Pi host, extension lifecycle and feature execute with an isolated deterministic models.json registration; no provider inference or network request is made",
  process_deadline_ms: PROBE_TIMEOUT_MS,
  unhandled_errors: cases.filter((item) => item.hasUnhandledError).length,
  extension_load_errors: cases.filter((item) => item.hasLoadError || (item.name === "extension_load" && !item.passed)).length,
  cases: cases.map(({ hasUnhandledError, hasLoadError, ...item }) => item),
};
mkdirSync(resolve(root, "docs/verification"), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  verification_contract: VERIFICATION_CONTRACT,
  platform: process.platform,
  unhandled_errors: report.unhandled_errors,
  extension_load_errors: report.extension_load_errors,
  cases: cases.map(({ name, passed, exit_code }) => ({ name, passed, exit_code })),
}));
if (cases.some((item) => !item.passed)) process.exitCode = 1;
