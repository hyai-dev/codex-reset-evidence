# WhenResets.com Codex announcement metadata pack

This pack is a metadata-only projection of one saved [WhenResets.com `archive-v1` snapshot](https://whenresets.com/api/v1/archive?snapshot_id=wr-668dc4b04c0ef700a55c3f8693d603ffe15af7b81bc04cb3fb865037f5f3a822). It is a historical collection of **public Codex announcements and actions**, not an OpenAI account usage feed or a forecast. `announced_at` is a source-reported announcement time; an unknown `effective_at` stays null.

| Fixed snapshot fact (not a live count) | Value |
| --- | ---: |
| Snapshot generated (UTC) | 2026-09-30 17:55:15 |
| Total event records | 76 |
| Active event records | 67 |
| Completed public source records | 63 |
| Records needing review | 10 |
| Independently verified global resets | 0 |
| Coverage | partial |

The archive also has 79 distinct announcement records and 8,894 revision metadata rows. **These counts are different concepts**: 76 events do not mean 76 independently verified global resets. Source status entries are not independent confirmations; the frozen snapshot has seven such entries and partial coverage.

## Files

| File | Contents |
| --- | --- |
| [`data/manifest.json`](data/manifest.json) | Snapshot ID, `archive-v1`/`v1`, UTC timestamp, source URL, attribution, counts, coverage, SHA-256 hashes. |
| [`data/events.json`](data/events.json), [`data/events.csv`](data/events.csv) | 76 event metadata records: IDs, classification, reported/effective time, time precision, plan labels, source URL, verification state, revision number, merge target. |
| [`data/announcements.json`](data/announcements.json), [`data/announcements.csv`](data/announcements.csv) | 79 announcement IDs, source URLs, times, linked event/evidence IDs. |
| [`data/revisions.json`](data/revisions.json), [`data/revisions.csv`](data/revisions.csv) | 8,894 revision IDs, linked event IDs, revision numbers and timestamps only. |
| [`data/coverage.json`](data/coverage.json) | Partial coverage and status metadata for the seven source entries. |

JSON collections include `meta`, API `attribution`, the metadata terms identifier and coverage state. CSV files include `snapshot_id` and `schema_version` columns; keep this README and manifest when sharing a CSV.

## Rebuild and verify

Node.js 20 or newer; no dependencies or credentials are required.

```sh
npm run generate      # fetch this exact saved snapshot, project the allowlist, overwrite data/
npm run verify        # offline row, field, attribution, hash and count checks
npm run check:source  # fetch the same saved snapshot again and byte-compare all outputs
```

The generator rejects a changed snapshot ID, schema/version, timestamp, summary, review/global counts or coverage. It does not download or save the raw archive response. The offline verifier checks the allowed fields, file SHA-256 hashes, unique IDs, source URLs and independently derived active/completed/review counts.

## Content and reuse boundary

Only explicitly listed fields are copied. This projection omits `events[].text`, `events[].evidence` (including `evidence[].text`), `announcements[].text`, `events[].classification_reason`, and revision `reason`, `before` and `after`. It contains source links and IDs, **not** third-party post bodies or excerpts. Do not infer a complete record of all resets from it.

Attribute metadata to **WhenResets** with the [snapshot URL](https://whenresets.com/api/v1/archive?snapshot_id=wr-668dc4b04c0ef700a55c3f8693d603ffe15af7b81bc04cb3fb865037f5f3a822) and `archive-v1` schema/version. The manifest preserves the API's `metadata_terms` and `excluded` wording alongside `LicenseRef-WhenResets-Metadata-Attribution`; see [DATA_REUSE.md](DATA_REUSE.md) and the site's [methodology and reuse notes](https://whenresets.com/methodology). The site's permission for its own metadata does not grant a license to republish original posts, source excerpts, images or third-party datasets. **No MIT license is asserted for this pack.**

WhenResets.com is an independent site, unaffiliated with OpenAI and separate from `whenresets.net` and `whenresets.cc`.
