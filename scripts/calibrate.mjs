#!/usr/bin/env node
/**
 * Strengths Analyzer Calibration Script
 *
 * Reads paired (self / gallup) JSON files from
 * analysis/strengths-calibration/results/ and generates:
 *   - comparison/per-user/{name}.json
 *   - comparison/aggregate.json
 *   - comparison/theme-drift.csv
 *
 * Usage:
 *   node scripts/calibrate.mjs
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RESULTS_DIR = join(ROOT, "analysis/strengths-calibration/results");
const COMPARISON_DIR = join(ROOT, "analysis/strengths-calibration/comparison");
const PER_USER_DIR = join(COMPARISON_DIR, "per-user");

if (!existsSync(PER_USER_DIR)) mkdirSync(PER_USER_DIR, { recursive: true });

// ---------------- Load all results ----------------
const files = readdirSync(RESULTS_DIR).filter(f => f.endsWith(".json"));
const records = [];
for (const f of files) {
  try {
    const data = JSON.parse(readFileSync(join(RESULTS_DIR, f), "utf-8"));
    const name = data.user?.name || f;
    const isGallup = data.source === "gallup_official" || /gallup/i.test(f);
    const isSelf = data.source === "self_tool" || /_self_/i.test(f);
    if (isGallup) {
      records.push({ kind: "gallup", name, file: f, takenAt: data.takenAt, themes: data.themes });
    } else if (isSelf || data.themes) {
      const version = data.toolVersion || (f.match(/_v(\d+)/)?.[1] ? `v${f.match(/_v(\d+)/)[1]}` : "unknown");
      records.push({ kind: "self", name, version, file: f, takenAt: data.takenAt, themes: data.themes, archetype: data.archetype });
    }
  } catch (e) {
    console.warn(`Skip ${f}: ${e.message}`);
  }
}

// Group by user
const usersByName = {};
records.forEach(r => {
  if (!usersByName[r.name]) usersByName[r.name] = { gallup: null, selfRecords: [] };
  if (r.kind === "gallup") usersByName[r.name].gallup = r;
  else usersByName[r.name].selfRecords.push(r);
});

// ---------------- Per-user comparison ----------------
const perUserResults = [];
for (const name of Object.keys(usersByName)) {
  const { gallup, selfRecords } = usersByName[name];
  if (!gallup || selfRecords.length === 0) continue;
  const gallupRankByName = {};
  gallup.themes.forEach(t => gallupRankByName[t.name] = t.rank);

  // Per version
  const byVersion = {};
  for (const self of selfRecords) {
    const selfRankByName = {};
    self.themes.forEach(t => selfRankByName[t.name] = t.rank);

    const perTheme = gallup.themes.map(g => {
      const selfRank = selfRankByName[g.name];
      const delta = selfRank != null ? selfRank - g.rank : null;
      return { name: g.name, domain: g.domain, gallup: g.rank, self: selfRank, delta };
    });
    const validDeltas = perTheme.filter(p => p.delta != null);
    const meanAbsDelta = validDeltas.reduce((sum, p) => sum + Math.abs(p.delta), 0) / validDeltas.length;
    const within5 = validDeltas.filter(p => Math.abs(p.delta) <= 5).length;
    const top10Self = new Set(self.themes.filter(t => t.rank <= 10).map(t => t.name));
    const top10Gallup = new Set(gallup.themes.filter(t => t.rank <= 10).map(t => t.name));
    const top10Overlap = [...top10Self].filter(n => top10Gallup.has(n)).length;
    const bot5Self = new Set(self.themes.filter(t => t.rank >= 30).map(t => t.name));
    const bot5Gallup = new Set(gallup.themes.filter(t => t.rank >= 30).map(t => t.name));
    const bottom5Overlap = [...bot5Self].filter(n => bot5Gallup.has(n)).length;

    byVersion[self.version] = {
      file: self.file,
      takenAt: self.takenAt,
      archetype: self.archetype,
      stats: {
        meanAbsDelta: +meanAbsDelta.toFixed(2),
        within5Count: within5,
        within5Pct: +(within5 / validDeltas.length).toFixed(2),
        top10Overlap, top10OverlapPct: +(top10Overlap / 10).toFixed(2),
        bottom5Overlap, bottom5OverlapPct: +(bottom5Overlap / 5).toFixed(2),
      },
      perTheme,
    };
  }

  const userPayload = {
    user: name,
    comparedAt: new Date().toISOString(),
    gallup: { takenAt: gallup.takenAt, file: gallup.file },
    versions: byVersion,
  };
  writeFileSync(join(PER_USER_DIR, `${name}.json`), JSON.stringify(userPayload, null, 2));
  perUserResults.push(userPayload);
}

// ---------------- Aggregate ----------------
// For each theme, collect all (gallup, self_latest) deltas across users
const themeData = {};

for (const userPayload of perUserResults) {
  const versions = Object.keys(userPayload.versions);
  if (versions.length === 0) continue;
  // Use latest version (sort by version string descending)
  versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const latest = userPayload.versions[versions[0]];
  for (const t of latest.perTheme) {
    if (t.delta == null) continue;
    if (!themeData[t.name]) themeData[t.name] = { domain: t.domain, deltas: [], gallupRanks: [], selfRanks: [] };
    themeData[t.name].deltas.push(t.delta);
    themeData[t.name].gallupRanks.push(t.gallup);
    themeData[t.name].selfRanks.push(t.self);
  }
}

const themeDrift = Object.entries(themeData).map(([name, d]) => {
  const n = d.deltas.length;
  const meanDelta = d.deltas.reduce((s, x) => s + x, 0) / n;
  const meanAbsDelta = d.deltas.reduce((s, x) => s + Math.abs(x), 0) / n;
  const variance = d.deltas.reduce((s, x) => s + (x - meanDelta) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  let verdict = "stable";
  if (meanAbsDelta >= 12) verdict = "weak";
  else if (meanAbsDelta >= 6) verdict = "drifting";
  return {
    theme: name, domain: d.domain, samples: n,
    meanDelta: +meanDelta.toFixed(2),
    meanAbsDelta: +meanAbsDelta.toFixed(2),
    stdDev: +stdDev.toFixed(2),
    verdict,
  };
});
themeDrift.sort((a, b) => b.meanAbsDelta - a.meanAbsDelta);

const aggregate = {
  generatedAt: new Date().toISOString(),
  samples: perUserResults.length,
  themeDrift,
  weakestThemes: themeDrift.slice(0, 5).map(t => t.theme),
  stableThemes: themeDrift.slice(-5).reverse().map(t => t.theme),
};
writeFileSync(join(COMPARISON_DIR, "aggregate.json"), JSON.stringify(aggregate, null, 2));

// CSV
const csvLines = ["theme,domain,samples,meanDelta,meanAbsDelta,stdDev,verdict"];
for (const t of themeDrift) {
  csvLines.push([t.theme, t.domain, t.samples, t.meanDelta, t.meanAbsDelta, t.stdDev, t.verdict].join(","));
}
writeFileSync(join(COMPARISON_DIR, "theme-drift.csv"), "﻿" + csvLines.join("\n"));

// ---------------- Output summary ----------------
console.log(`\n=== Calibration Report ===`);
console.log(`Users with both Gallup + Self results: ${perUserResults.length}`);
for (const u of perUserResults) {
  const versions = Object.keys(u.versions).sort();
  console.log(`\n${u.user}:`);
  for (const v of versions) {
    const s = u.versions[v].stats;
    console.log(`  ${v}: meanAbsΔ=${s.meanAbsDelta}, top10=${s.top10Overlap}/10, bot5=${s.bottom5Overlap}/5, ±5位=${s.within5Count}/34`);
  }
}
if (themeDrift.length > 0) {
  console.log(`\nWeakest themes (largest mean absolute delta):`);
  themeDrift.slice(0, 5).forEach(t => {
    console.log(`  ${t.theme}: meanAbsΔ=${t.meanAbsDelta} (n=${t.samples}, ${t.verdict})`);
  });
}
console.log(`\nFiles written:`);
console.log(`  - ${join(PER_USER_DIR)}/*.json`);
console.log(`  - ${join(COMPARISON_DIR, "aggregate.json")}`);
console.log(`  - ${join(COMPARISON_DIR, "theme-drift.csv")}`);
