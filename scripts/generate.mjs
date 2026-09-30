import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DATA_DIR = path.join(ROOT, "data");
const SNAPSHOT_ID =
  "wr-668dc4b04c0ef700a55c3f8693d603ffe15af7b81bc04cb3fb865037f5f3a822";
const SNAPSHOT_URL = `https://whenresets.com/api/v1/archive?snapshot_id=${SNAPSHOT_ID}`;
const EXPECTED = Object.freeze({
  generated_at: "2026-09-30T17:55:15Z",
  schema_version: "archive-v1",
  api_version: "v1",
  timezone: "UTC",
  total_events: 76,
  active_events: 67,
  completed_source_records: 63,
  announcement_count: 79,
  needs_review: 10,
  verified_global: 0,
  revisions: 8894,
  coverage_state: "partial",
});

// Deliberately exclude event.text, event.evidence, announcement.text,
// classification_reason, revision.reason, revision.before and revision.after.
const EVENT_FIELDS = [
  "event_id",
  "legacy_id",
  "announcement_id",
  "related_event_id",
  "legacy_type",
  "legacy_status",
  "event_type",
  "announced_at",
  "effective_at",
  "time_precision",
  "affected_plans",
  "source_url",
  "verification_status",
  "verified_at",
  "revision",
  "merged_into",
];
const ANNOUNCEMENT_FIELDS = [
  "announcement_id",
  "source_url",
  "announced_at",
  "event_ids",
  "evidence_ids",
];
const REVISION_FIELDS = ["revision_id", "event_id", "revision", "changed_at"];
const COVERAGE_SOURCE_FIELDS = [
  "id",
  "url",
  "scope",
  "role",
  "transport_ok",
  "content_state",
  "checked_at",
  "coverage_from",
  "coverage_through",
  "complete",
  "evidence_url",
  "replacement_for",
  "attestation_id",
];

function assert(value, message) {
  if (!value) throw new Error(message);
}

function pick(source, fields, context) {
  assert(source && typeof source === "object", `${context} is not an object`);
  const result = {};
  for (const field of fields) {
    assert(Object.hasOwn(source, field), `${context} is missing ${field}`);
    result[field] = source[field];
  }
  return result;
}

function validate(snapshot) {
  const { meta, data } = snapshot;
  assert(meta?.snapshot_id === SNAPSHOT_ID, "snapshot_id mismatch");
  for (const key of ["generated_at", "schema_version", "api_version", "timezone"]) {
    assert(meta[key] === EXPECTED[key], `${key} mismatch`);
  }
  for (const key of [
    "total_events",
    "active_events",
    "completed_source_records",
    "announcement_count",
  ]) {
    assert(data?.summary?.[key] === EXPECTED[key], `${key} mismatch`);
  }
  assert(data?.types?.needs_review?.n === EXPECTED.needs_review, "needs_review mismatch");
  assert(data?.types?.verified_global?.n === EXPECTED.verified_global, "verified_global mismatch");
  assert(data?.coverage?.state === EXPECTED.coverage_state, "coverage state mismatch");
  assert(data?.attribution?.publisher === "WhenResets", "publisher mismatch");
  assert(data?.attribution?.snapshot_url === SNAPSHOT_URL, "attribution URL mismatch");
  for (const [key, count] of [
    ["events", EXPECTED.total_events],
    ["announcements", EXPECTED.announcement_count],
    ["revisions", EXPECTED.revisions],
  ]) {
    assert(Array.isArray(data?.[key]) && data[key].length === count, `${key} count mismatch`);
  }
  assert(Array.isArray(data?.coverage?.sources), "coverage sources missing");
  for (const [key, idKey] of [
    ["events", "event_id"],
    ["announcements", "announcement_id"],
    ["revisions", "revision_id"],
  ]) {
    assert(new Set(data[key].map((record) => record[idKey])).size === data[key].length, `${key} IDs are not unique`);
  }
}

function csvCell(value) {
  const raw = value === null || value === undefined ? "" : Array.isArray(value) ? JSON.stringify(value) : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function csv(records, fields) {
  const columns = ["snapshot_id", "schema_version", ...fields];
  const lines = [columns.join(",")];
  for (const record of records) {
    lines.push(
      [SNAPSHOT_ID, EXPECTED.schema_version, ...fields.map((field) => record[field])]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

const pretty = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function main() {
  const check = process.argv.includes("--check");
  const response = await fetch(SNAPSHOT_URL, { signal: AbortSignal.timeout(30000) });
  assert(response.ok, `Snapshot request failed: HTTP ${response.status}`);
  const snapshot = await response.json();
  validate(snapshot);

  const { meta, data } = snapshot;
  const attribution = pick(data.attribution, ["publisher", "snapshot_url", "scope", "limitations"], "attribution");
  const license = pick(data.license, ["id", "metadata_terms", "required_attribution", "excluded"], "license");
  const coverage = {
    state: data.coverage.state,
    checked_at: data.coverage.checked_at,
    required_scopes: data.coverage.required_scopes,
    missing_scopes: data.coverage.missing_scopes,
    sources: data.coverage.sources.map((item, i) => pick(item, COVERAGE_SOURCE_FIELDS, `coverage source ${i}`)),
  };
  const collections = [
    ["events", data.events, EVENT_FIELDS],
    ["announcements", data.announcements, ANNOUNCEMENT_FIELDS],
    ["revisions", data.revisions, REVISION_FIELDS],
  ];
  const outputs = new Map();
  const manifestFiles = {};
  for (const [name, sourceRecords, fields] of collections) {
    const records = sourceRecords.map((item, i) => pick(item, fields, `${name} ${i}`));
    const json = pretty({ meta, attribution, license, coverage: { state: coverage.state, checked_at: coverage.checked_at }, records });
    const table = csv(records, fields);
    for (const [extension, body] of [["json", json], ["csv", table]]) {
      const filename = `${name}.${extension}`;
      outputs.set(filename, body);
      manifestFiles[filename] = { rows: records.length, sha256: sha256(body) };
    }
  }
  const coverageJSON = pretty({ meta, attribution, license, coverage });
  outputs.set("coverage.json", coverageJSON);
  manifestFiles["coverage.json"] = { rows: coverage.sources.length, sha256: sha256(coverageJSON) };
  outputs.set(
    "manifest.json",
    pretty({
      source_url: SNAPSHOT_URL,
      meta,
      attribution,
      license,
      summary: pick(data.summary, ["total_events", "active_events", "announcement_count", "completed_source_records"], "summary"),
      type_counts: {
        needs_review: data.types.needs_review.n,
        verified_global: data.types.verified_global.n,
      },
      coverage: {
        state: coverage.state,
        checked_at: coverage.checked_at,
        source_status_entries: coverage.sources.length,
      },
      excluded_source_fields: [
        "events[].text",
        "events[].evidence",
        "events[].classification_reason",
        "announcements[].text",
        "revisions[].reason",
        "revisions[].before",
        "revisions[].after",
      ],
      files: manifestFiles,
    }),
  );

  // A second guard catches accidental copying of a full third-party body into
  // a whitelisted field, including an unexpected future URL or plan label.
  const thirdPartyBodies = new Set([
    ...data.events.flatMap((event) => [event.text, ...event.evidence.map((item) => item.text)]),
    ...data.announcements.map((item) => item.text),
  ].filter((value) => typeof value === "string" && value.length >= 20));
  const projectedData = [...outputs.entries()]
    .filter(([filename]) => filename !== "manifest.json")
    .map(([, body]) => body)
    .join("\n");
  for (const body of thirdPartyBodies) {
    assert(
      !projectedData.includes(body) && !projectedData.includes(JSON.stringify(body).slice(1, -1)),
      "A third-party source excerpt leaked into a metadata output",
    );
  }

  await mkdir(DATA_DIR, { recursive: true });
  for (const [filename, body] of outputs) {
    const target = path.join(DATA_DIR, filename);
    if (check) {
      assert((await readFile(target, "utf8")) === body, `${filename} differs from fixed snapshot`);
    } else {
      await writeFile(target, body, "utf8");
    }
  }
  console.log(`${check ? "Matched" : "Generated"} ${outputs.size} files from ${SNAPSHOT_ID}`);
  console.log(`Rows: ${data.events.length} events, ${data.announcements.length} announcements, ${data.revisions.length} revision metadata, ${coverage.sources.length} source status entries`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
