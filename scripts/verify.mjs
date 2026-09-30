import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DATA = path.join(ROOT, "data");
const SNAPSHOT_ID =
  "wr-668dc4b04c0ef700a55c3f8693d603ffe15af7b81bc04cb3fb865037f5f3a822";
const SOURCE_URL = `https://whenresets.com/api/v1/archive?snapshot_id=${SNAPSHOT_ID}`;
const FIELDS = {
  events: [
    "event_id", "legacy_id", "announcement_id", "related_event_id",
    "legacy_type", "legacy_status", "event_type", "announced_at",
    "effective_at", "time_precision", "affected_plans", "source_url",
    "verification_status", "verified_at", "revision", "merged_into",
  ],
  announcements: ["announcement_id", "source_url", "announced_at", "event_ids", "evidence_ids"],
  revisions: ["revision_id", "event_id", "revision", "changed_at"],
};
const COUNTS = { events: 76, announcements: 79, revisions: 8894 };

function assert(value, message) {
  if (!value) throw new Error(message);
}

function keysEqual(value, fields, context) {
  assert(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...fields].sort()),
    `${context} has an unexpected or missing field`,
  );
}

async function main() {
  const manifest = JSON.parse(await readFile(path.join(DATA, "manifest.json"), "utf8"));
  assert(manifest.source_url === SOURCE_URL, "manifest source URL mismatch");
  assert(manifest.meta.snapshot_id === SNAPSHOT_ID, "manifest snapshot ID mismatch");
  assert(manifest.meta.schema_version === "archive-v1", "schema version mismatch");
  assert(manifest.meta.api_version === "v1", "API version mismatch");
  assert(manifest.meta.generated_at === "2026-09-30T17:55:15Z", "snapshot timestamp mismatch");
  assert(manifest.attribution.publisher === "WhenResets", "publisher mismatch");
  assert(manifest.attribution.snapshot_url === SOURCE_URL, "attribution URL mismatch");
  assert(manifest.license.id === "LicenseRef-WhenResets-Metadata-Attribution", "metadata terms ID mismatch");
  assert(manifest.license.metadata_terms.includes("WhenResets-authored metadata"), "metadata reuse scope missing");
  assert(manifest.license.excluded.includes("does not license third-party text"), "third-party exclusion missing");
  assert(manifest.summary.total_events === 76, "total events mismatch");
  assert(manifest.summary.active_events === 67, "active events mismatch");
  assert(manifest.summary.completed_source_records === 63, "completed source records mismatch");
  assert(manifest.summary.announcement_count === 79, "announcement count mismatch");
  assert(manifest.type_counts.needs_review === 10, "review count mismatch");
  assert(manifest.type_counts.verified_global === 0, "verified global count mismatch");
  assert(manifest.coverage.state === "partial", "coverage mismatch");
  assert(manifest.coverage.source_status_entries === 7, "source status entry count mismatch");

  const loaded = {};
  for (const [filename, info] of Object.entries(manifest.files)) {
    const content = await readFile(path.join(DATA, filename), "utf8");
    assert(createHash("sha256").update(content).digest("hex") === info.sha256, `${filename} hash mismatch`);
    if (filename.endsWith(".json")) loaded[filename] = JSON.parse(content);
    if (filename.endsWith(".csv")) {
      const name = filename.slice(0, -4);
      const lines = content.trimEnd().split("\n");
      assert(lines.length === COUNTS[name] + 1, `${filename} row count mismatch`);
      assert(
        lines[0] === ["snapshot_id", "schema_version", ...FIELDS[name]].join(","),
        `${filename} header mismatch`,
      );
      assert(lines.slice(1).every((line) => line.startsWith(`${SNAPSHOT_ID},archive-v1,`)), `${filename} row lost version`);
    }
  }
  for (const [name, fields] of Object.entries(FIELDS)) {
    const payload = loaded[`${name}.json`];
    assert(payload.meta.snapshot_id === SNAPSHOT_ID, `${name}.json lost snapshot`);
    assert(payload.meta.schema_version === "archive-v1", `${name}.json lost schema`);
    assert(payload.attribution.snapshot_url === SOURCE_URL, `${name}.json lost attribution`);
    assert(payload.license.metadata_terms === manifest.license.metadata_terms, `${name}.json lost reuse scope`);
    assert(payload.license.excluded === manifest.license.excluded, `${name}.json lost text exclusion`);
    assert(payload.coverage.state === "partial", `${name}.json lost coverage`);
    assert(payload.records.length === COUNTS[name], `${name}.json row count mismatch`);
    payload.records.forEach((record, index) => keysEqual(record, fields, `${name}[${index}]`));
  }
  const events = loaded["events.json"].records;
  const announcements = loaded["announcements.json"].records;
  const revisions = loaded["revisions.json"].records;
  const eventIDs = new Set(events.map((item) => item.event_id));
  assert(eventIDs.size === 76, "event IDs not unique");
  assert(events.filter((item) => item.merged_into === null).length === 67, "active event derivation mismatch");
  assert(events.filter((item) => item.merged_into === null && item.legacy_status === "confirmed").length === 63, "completed source record derivation mismatch");
  assert(events.filter((item) => item.verification_status === "needs_review").length === 10, "needs_review derivation mismatch");
  assert(events.filter((item) => item.event_type === "global_reset" && item.verification_status === "verified").length === 0, "global verification derivation mismatch");
  assert(new Set(announcements.map((item) => item.announcement_id)).size === 79, "announcement IDs not unique");
  assert(new Set(revisions.map((item) => item.revision_id)).size === 8894, "revision IDs not unique");
  for (const event of events) {
    assert(new URL(event.source_url).protocol === "https:", `${event.event_id} has non-HTTPS source URL`);
  }
  assert(loaded["coverage.json"].coverage.state === "partial", "coverage file mismatch");
  assert(loaded["coverage.json"].coverage.sources.length === 7, "coverage source rows mismatch");
  const forbidden = new Set(["text", "evidence", "classification_reason", "reason", "before", "after"]);
  for (const name of Object.keys(FIELDS)) {
    for (const record of loaded[`${name}.json`].records) {
      assert(!Object.keys(record).some((key) => forbidden.has(key)), `${name}.json contains prohibited content field`);
    }
  }
  console.log("Offline verification passed: 76 events, 79 announcements, 8,894 revision metadata rows, 7 source status entries.");
  console.log("Checked fixed snapshot attribution, schema/version, partial coverage, counts, hashes, URLs, and content field allowlists.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
