import { appendFile, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const CONFIG_PATH = ".github/compatibility-watch.json";
const PACKAGE_PATH = "package.json";
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const EXPECTED_PACKAGES = [
  "@oh-my-pi/pi-agent-core",
  "@oh-my-pi/pi-ai",
  "@oh-my-pi/pi-coding-agent",
  "@oh-my-pi/pi-tui",
];

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} has unexpected keys`);
}

export function parseVersion(value, label = "version") {
  if (typeof value !== "string" || !SEMVER_PATTERN.test(value)) throw new Error(`${label} must be exact semver`);
  return { value, major: Number(value.split(".", 1)[0]) };
}

export function parseConfiguration(value) {
  exactKeys(value, ["schemaVersion", "upstream", "ompPackages"], "watch config");
  if (value.schemaVersion !== 1) throw new Error("unsupported watch config schemaVersion");
  exactKeys(value.upstream, ["repository", "ref", "lastReviewedSha"], "upstream config");
  if (value.upstream.repository !== "NVlabs/SoL-Pi" || value.upstream.ref !== "main") {
    throw new Error("unexpected upstream repository or ref");
  }
  if (!SHA_PATTERN.test(value.upstream.lastReviewedSha)) throw new Error("lastReviewedSha must be a lowercase commit SHA");
  if (!Array.isArray(value.ompPackages) || JSON.stringify(value.ompPackages) !== JSON.stringify(EXPECTED_PACKAGES)) {
    throw new Error("ompPackages must contain the canonical OMP package family");
  }
  return value;
}

export function readBaseline(packageJson, config) {
  const pins = Object.fromEntries(config.ompPackages.map((name) => [name, packageJson.devDependencies?.[name]]));
  const versions = Object.entries(pins).map(([name, version]) => parseVersion(version, name));
  const majors = new Set(versions.map((version) => version.major));
  if (majors.size !== 1) throw new Error("OMP package family must use one major version");
  return { pins, major: versions[0].major };
}

export function evaluateWatch({ config, baseline, upstreamSha, latestVersions }) {
  if (!SHA_PATTERN.test(upstreamSha)) throw new Error("upstream SHA is invalid");
  const parsedLatest = Object.fromEntries(
    config.ompPackages.map((name) => [name, parseVersion(latestVersions[name], `${name} latest`)]),
  );
  const latestMajors = new Set(Object.values(parsedLatest).map((version) => version.major));
  const registryConsistent = latestMajors.size === 1;
  const latestMajor = registryConsistent ? [...latestMajors][0] : Math.max(...latestMajors);
  const upstreamChanged = upstreamSha !== config.upstream.lastReviewedSha;
  const ompMajorChanged = latestMajor > baseline.major;
  const reasons = [];
  if (upstreamChanged) reasons.push("upstream-changed");
  if (ompMajorChanged) reasons.push("omp-major-changed");
  if (!registryConsistent) reasons.push("omp-registry-inconsistent");
  return {
    schemaVersion: 1,
    status: reasons.length === 0 ? "ok" : "review-required",
    reasons,
    baseline: { ompMajor: baseline.major, pins: baseline.pins },
    upstream: {
      repository: config.upstream.repository,
      ref: config.upstream.ref,
      reviewedSha: config.upstream.lastReviewedSha,
      headSha: upstreamSha,
      changed: upstreamChanged,
    },
    omp: {
      latest: Object.fromEntries(Object.entries(parsedLatest).map(([name, version]) => [name, version.value])),
      latestMajor,
      majorChanged: ompMajorChanged,
      registryConsistent,
    },
  };
}

async function fetchJson(url, headers, fetcher) {
  const response = await fetcher(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${new URL(url).host} returned HTTP ${response.status}`);
  return await response.json();
}

export async function collectWatchInput(config, fetcher = fetch) {
  const githubHeaders = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "SoL-OMP-compatibility-watch",
  };
  if (process.env.GITHUB_TOKEN) githubHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const commit = await fetchJson(
    `https://api.github.com/repos/${config.upstream.repository}/commits/${encodeURIComponent(config.upstream.ref)}`,
    githubHeaders,
    fetcher,
  );
  const latestVersions = {};
  for (const name of config.ompPackages) {
    const encoded = name.replace("/", "%2f");
    const metadata = await fetchJson(
      `https://registry.npmjs.org/${encoded}/latest`,
      { Accept: "application/json", "User-Agent": "SoL-OMP-compatibility-watch" },
      fetcher,
    );
    latestVersions[name] = metadata.version;
  }
  return { upstreamSha: commit.sha, latestVersions };
}

function issuePayload(result) {
  const upstreamLine = result.upstream.changed
    ? `- SoL-Pi changed: \`${result.upstream.reviewedSha}\` → \`${result.upstream.headSha}\``
    : "- SoL-Pi: no unreviewed commit";
  const ompLine = result.omp.majorChanged
    ? `- OMP major changed: ${result.baseline.ompMajor} → ${result.omp.latestMajor}`
    : `- OMP major: ${result.baseline.ompMajor} (no newer major)`;
  const consistency = result.omp.registryConsistent ? "consistent" : "inconsistent package-family latest versions";
  return {
    title: "Compatibility review required: SoL-Pi or OMP update",
    body: [
      "<!-- sol-omp-compatibility-watch -->",
      "Automated metadata checks detected a compatibility review trigger.",
      "",
      upstreamLine,
      ompLine,
      `- OMP registry state: ${consistency}`,
      "",
      "This workflow does not execute unreviewed upstream code. Review the changes, update the pinned OMP package family or port relevant SoL-Pi changes in an isolated branch, then run:",
      "",
      "```bash",
      "bun install --frozen-lockfile --ignore-scripts",
      "bun run check",
      "bun run compat",
      "```",
      "",
      "After review, update `.github/compatibility-watch.json#upstream.lastReviewedSha` and the OMP baseline when applicable, then close this issue.",
    ].join("\n"),
  };
}

export async function upsertIssue(result, { repository, token, fetcher = fetch }) {
  if (result.status === "ok") return { action: "none" };
  if (!token) throw new Error("GITHUB_TOKEN is required to publish an issue");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) throw new Error("GITHUB_REPOSITORY is invalid");
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "SoL-OMP-compatibility-watch",
  };
  const base = `https://api.github.com/repos/${repository}`;
  const issues = await fetchJson(`${base}/issues?state=open&per_page=100`, headers, fetcher);
  const existing = Array.isArray(issues)
    ? issues.find((issue) => !issue.pull_request && typeof issue.body === "string" && issue.body.includes("<!-- sol-omp-compatibility-watch -->"))
    : undefined;
  const payload = issuePayload(result);
  const url = existing ? `${base}/issues/${existing.number}` : `${base}/issues`;
  const response = await fetcher(url, { method: existing ? "PATCH" : "POST", headers, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`GitHub issue API returned HTTP ${response.status}`);
  const issue = await response.json();
  return { action: existing ? "updated" : "created", url: issue.html_url };
}

function actionsOutputs(result) {
  return [
    `status=${result.status}`,
    `upstream_changed=${result.upstream.changed}`,
    `omp_major_changed=${result.omp.majorChanged}`,
  ].join("\n") + "\n";
}

export async function main({ fetcher = fetch } = {}) {
  const config = parseConfiguration(JSON.parse(await readFile(CONFIG_PATH, "utf8")));
  const packageJson = JSON.parse(await readFile(PACKAGE_PATH, "utf8"));
  const baseline = readBaseline(packageJson, config);
  const fixturePath = process.env.COMPAT_WATCH_FIXTURE;
  const remote = fixturePath
    ? JSON.parse(await readFile(fixturePath, "utf8"))
    : await collectWatchInput(config, fetcher);
  const result = evaluateWatch({ config, baseline, ...remote });
  const resultPath = process.env.COMPAT_WATCH_RESULT;
  if (resultPath) await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, actionsOutputs(result));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Compatibility watch\n\nStatus: **${result.status}**\n`);
  if (process.env.COMPAT_WATCH_NOTIFY === "1") {
    const notification = await upsertIssue(result, {
      repository: process.env.GITHUB_REPOSITORY ?? "",
      token: process.env.GITHUB_TOKEN ?? "",
      fetcher,
    });
    console.log(JSON.stringify({ result, notification }));
  } else {
    console.log(JSON.stringify(result));
  }
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Compatibility watch failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
