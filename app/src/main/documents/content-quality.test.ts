import { describe, expect, test } from "bun:test";
import {
  assertDocumentContentOrThrow,
  assessDocumentContent,
  shouldAssessDocumentContent,
  THIN_CONTENT_ERROR,
} from "./content-quality";

const METASPLOIT_SKELETON = `# Introduction

# Installing Metasploit
1. Step 1: Download and install Metasploit
2. Step 2: Configure Metasploit settings

# Using Metasploit
## Scanning targets
1. Step 1: Choose a scanning technique
2. Step 2: Run the scan

# Exploiting vulnerabilities
## Finding exploitable vulnerabilities
1. Step 1: Use the search feature to find exploits
2. Step 2: Select an exploit and configure settings
`;

const SOLID_GUIDE = `# Introduction

Metasploit is an open-source penetration testing framework used to discover,
validate, and demonstrate security weaknesses in a controlled lab. This guide
walks through install, scanning, and exploiting a vulnerable target ethically.

# Installing Metasploit

On Kali Linux, Metasploit Framework is often preinstalled. Elsewhere, install
via the official Rapid7 installer or your package manager, then verify with:

\`\`\`
msfconsole -v
\`\`\`

After install, start the console and wait until the prompt is ready. Update
modules periodically so search results stay current.

# Using Metasploit

## Scanning targets

Choose a technique based on scope. For a single host on a lab network:

\`\`\`
db_nmap -sV 192.168.56.101
\`\`\`

Review open ports and service versions. Prefer non-destructive scans first.

# Exploiting vulnerabilities

## Finding exploitable vulnerabilities

Search the module database for the service and version you found, for example:

\`\`\`
search type:exploit platform:linux name:apache
\`\`\`

Select a module with \`use\`, set \`RHOSTS\` / \`LHOST\`, choose a payload, then
run \`check\` before \`exploit\` in authorized labs only.
`;

/** Body ≥400 with two genuinely empty headings — must trip rule 2, not rule 1. */
const EMPTY_HEADINGS_FIXTURE = `# Empty Section One

# Empty Section Two

# Substantive Section

This section contains enough prose to exceed the four hundred character minimum
for body content assessment. We include multiple sentences of real explanatory
text about deployment, configuration, monitoring, and rollback procedures so
that the body-length rule passes before the empty-heading rule is evaluated.
Additional detail on health checks, log aggregation, and incident response
rounds out the section with practical guidance for operators in production.
`;

/** Body in [400, 800) with ≥3 step stubs — must trip rule 3, not rule 1. */
const STEP_STUB_FIXTURE = `# Deployment Guide

Follow these steps to deploy the application to staging. Each step needs a title
but this guide intentionally lacks the explanatory prose expected by the guard.

1. Step 1: Pull the latest container image from the registry
2. Step 2: Apply the Kubernetes manifest to the staging cluster
3. Step 3: Run database migrations against the staging database
4. Step 4: Verify the health endpoint returns HTTP 200

Additional padding text here to ensure we stay above four hundred characters
total while remaining below eight hundred so the step-stub rule fires instead
of passing on body length alone. More filler about smoke tests and rollback.
`;

/** Dense runbook whose bash fence uses # comment lines — must pass (ok: true). */
const FENCED_HASH_COMMENTS_GUIDE = `# Server Setup Runbook

This runbook walks through provisioning a lab host with base packages, a service
account, and monitoring agents. Follow each section in order and verify health
checks before moving on. The commands below are examples for Ubuntu 22.04 LTS.

## Base packages

Install core tooling before creating users or services:

\`\`\`bash
# ---- base packages ----
# keep this list minimal
sudo apt-get update
sudo apt-get install -y curl git jq

# ---- user setup ----
# service account only
sudo useradd -r -s /bin/false appsvc
\`\`\`

Confirm binaries are on PATH and the service account exists before continuing.

## Monitoring

Deploy the node exporter and confirm scrape targets in Prometheus:

\`\`\`bash
# download and install exporter
curl -LO https://example.com/node_exporter.tar.gz
sudo tar -C /usr/local/bin -xzf node_exporter.tar.gz node_exporter
\`\`\`

Check \`/metrics\` locally, then register the host in your monitoring stack and
alert on disk, memory, and systemd unit failures during the burn-in period.
`;

describe("assessDocumentContent", () => {
  test("rejects Metasploit-style skeleton outline", () => {
    const r = assessDocumentContent(METASPLOIT_SKELETON);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.length).toBeGreaterThan(10);
  });

  test("accepts multi-paragraph guide with commands", () => {
    expect(assessDocumentContent(SOLID_GUIDE)).toEqual({ ok: true });
  });

  test("rejects short blurb", () => {
    const r = assessDocumentContent("# Hi\n\nToo short.");
    expect(r.ok).toBe(false);
  });

  test("rejects two empty headings via empty-section rule", () => {
    const r = assessDocumentContent(EMPTY_HEADINGS_FIXTURE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/headings have no body/);
  });

  test("rejects step-stub outline in 400–799 body band", () => {
    const r = assessDocumentContent(STEP_STUB_FIXTURE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/step titles without explanatory prose/);
  });

  test("accepts guide with hash comments inside fenced code blocks", () => {
    expect(assessDocumentContent(FENCED_HASH_COMMENTS_GUIDE)).toEqual({ ok: true });
  });

  test("THIN_CONTENT_ERROR mentions retry and research tools", () => {
    expect(THIN_CONTENT_ERROR).toMatch(/generate_document/);
    expect(THIN_CONTENT_ERROR).toMatch(/web_search/);
    expect(THIN_CONTENT_ERROR).toMatch(/http_fetch/);
  });
});

describe("shouldAssessDocumentContent", () => {
  test("returns true for pdf, docx, md", () => {
    expect(shouldAssessDocumentContent("pdf")).toBe(true);
    expect(shouldAssessDocumentContent("docx")).toBe(true);
    expect(shouldAssessDocumentContent("md")).toBe(true);
  });

  test("returns false for pptx and xlsx", () => {
    expect(shouldAssessDocumentContent("pptx")).toBe(false);
    expect(shouldAssessDocumentContent("xlsx")).toBe(false);
  });
});

describe("assertDocumentContentOrThrow", () => {
  test("throws THIN_CONTENT_ERROR for thin pdf content", () => {
    expect(() =>
      assertDocumentContentOrThrow("pdf", METASPLOIT_SKELETON)
    ).toThrow(THIN_CONTENT_ERROR);
  });

  test("throws for thin docx and md", () => {
    const thin = "# Hi\n\nToo short.";
    expect(() => assertDocumentContentOrThrow("docx", thin)).toThrow(THIN_CONTENT_ERROR);
    expect(() => assertDocumentContentOrThrow("md", thin)).toThrow(THIN_CONTENT_ERROR);
  });

  test("passes solid content for guarded formats", () => {
    expect(() => assertDocumentContentOrThrow("pdf", SOLID_GUIDE)).not.toThrow();
  });

  test("skips guard for pptx and xlsx", () => {
    expect(() => assertDocumentContentOrThrow("pptx", METASPLOIT_SKELETON)).not.toThrow();
    expect(() => assertDocumentContentOrThrow("xlsx", METASPLOIT_SKELETON)).not.toThrow();
  });
});
