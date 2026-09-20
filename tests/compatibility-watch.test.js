import { describe, expect, it } from "vitest";
import {
  evaluateWatch,
  parseConfiguration,
  readBaseline,
  upsertIssue,
} from "../scripts/check-compatibility-watch.mjs";

const reviewedSha = "a".repeat(40);
const newSha = "b".repeat(40);
const packages = [
  "@oh-my-pi/pi-agent-core",
  "@oh-my-pi/pi-ai",
  "@oh-my-pi/pi-coding-agent",
  "@oh-my-pi/pi-tui",
];
const config = parseConfiguration({
  schemaVersion: 1,
  upstream: { repository: "NVlabs/SoL-Pi", ref: "main", lastReviewedSha: reviewedSha },
  ompPackages: packages,
});
const packageJson = { devDependencies: Object.fromEntries(packages.map((name) => [name, "18.2.6"])) };
const baseline = readBaseline(packageJson, config);

function latest(version) {
  return Object.fromEntries(packages.map((name) => [name, version]));
}

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("compatibility watch", () => {
  it("reports unchanged metadata as healthy", () => {
    const result = evaluateWatch({ config, baseline, upstreamSha: reviewedSha, latestVersions: latest("18.9.0") });
    expect(result.status).toBe("ok");
    expect(result.reasons).toEqual([]);
  });

  it("requires review for a new SoL-Pi commit", () => {
    const result = evaluateWatch({ config, baseline, upstreamSha: newSha, latestVersions: latest("18.2.6") });
    expect(result.status).toBe("review-required");
    expect(result.reasons).toContain("upstream-changed");
  });

  it("requires review for a new OMP major", () => {
    const result = evaluateWatch({ config, baseline, upstreamSha: reviewedSha, latestVersions: latest("19.0.0") });
    expect(result.status).toBe("review-required");
    expect(result.omp.majorChanged).toBe(true);
  });

  it("rejects mixed OMP package-family latest majors", () => {
    const versions = latest("18.2.6");
    versions["@oh-my-pi/pi-ai"] = "19.0.0";
    const result = evaluateWatch({ config, baseline, upstreamSha: reviewedSha, latestVersions: versions });
    expect(result.reasons).toContain("omp-registry-inconsistent");
  });

  it("creates one tracking issue and updates the existing issue", async () => {
    const result = evaluateWatch({ config, baseline, upstreamSha: newSha, latestVersions: latest("19.0.0") });
    const calls = [];
    const createFetcher = async (url, options = {}) => {
      calls.push({ url, options });
      if (url.includes("?state=open")) return response(200, []);
      return response(201, { html_url: "https://github.com/Joon515/SoL-OMP/issues/1" });
    };
    expect(await upsertIssue(result, { repository: "Joon515/SoL-OMP", token: "test", fetcher: createFetcher }))
      .toEqual({ action: "created", url: "https://github.com/Joon515/SoL-OMP/issues/1" });
    expect(JSON.parse(calls[1].options.body).body).toContain("<!-- sol-omp-compatibility-watch -->");

    const updateFetcher = async (url, options = {}) => {
      if (url.includes("?state=open")) return response(200, [{ number: 1, body: "<!-- sol-omp-compatibility-watch -->" }]);
      expect(options.method).toBe("PATCH");
      return response(200, { html_url: "https://github.com/Joon515/SoL-OMP/issues/1" });
    };
    expect(await upsertIssue(result, { repository: "Joon515/SoL-OMP", token: "test", fetcher: updateFetcher }))
      .toEqual({ action: "updated", url: "https://github.com/Joon515/SoL-OMP/issues/1" });
  });
});
