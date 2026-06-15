/**
 * feature-sync — help a template copy discover engine features added upstream.
 *
 * GitHub "Use this template" copies have unrelated history with
 * prestomation/206events, so there is no merge-base to diff against. This
 * script instead does a *content-based* comparison: it diffs the local tree
 * against `upstream/main`, restricts the delta to ENGINE paths (excluding the
 * city-specific CONTENT and CONFIG that every copy deletes/regrows), and
 * clusters the differing files into named "features" the owner can decide on
 * one at a time.
 *
 * It is detection + reporting only. Applying a decision (checking out a
 * feature's files, opening a PR) and recording it in the ledger are driven by
 * skills/upstream-feature-sync/SKILL.md — the agent acts on this JSON.
 *
 * Usage:
 *   npm run feature-sync                 # human-readable summary (skips ledger-decided)
 *   npm run feature-sync -- --json       # machine-readable JSON for the skill
 *   npm run feature-sync -- --all        # include features already decided in the ledger
 *   npm run feature-sync -- --ref <ref>  # compare against a ref other than upstream/main
 *
 * The clustering is layered (see docs/upstream-feature-sync.md):
 *   1. design-doc anchored  — a feature named by its docs/<name>.md
 *   2. squash-commit anchored — doc-less changes grouped by their upstream
 *      commit (one commit ≈ one PR here), named by the commit subject
 *   3. minor — leftover dependency/config churn, collapsed into one bucket
 */

import { execFileSync } from "child_process";
import { readFileSync } from "fs";

// ---------------------------------------------------------------------------
// Path classification — derived from the engine/content/config buckets in
// docs/city-template.md. CONTENT is what init-city strips and a copy regrows;
// CONFIG is the per-city edit surface. Only ENGINE changes are features.
// ---------------------------------------------------------------------------

export type PathClass = "engine" | "content" | "config" | "skip";

/** Prefixes that are city-specific content a copy deletes and regrows. */
const CONTENT_PREFIXES = [
    "sources/",
    "docs/source-candidates/",
    "docs/discovery-log/",
    "allowed-removals/",
];

/** Individual content files (caches, Seattle data, per-city prose). */
const CONTENT_FILES = new Set([
    "event-uncertainty-cache.json",
    "geo-cache.json",
    "fetch-cache.json",
    "outofband-report.json",
    "ideas.md",
    "todo.md",
    "disabled-sources-plan.md",
    "README.md",
    "CONTRIBUTORS.md",
]);

/** The per-city edit surface and this tool's own ledger. */
const CONFIG_FILES = new Set(["city.config.ts", "feature-sync.json"]);

/** Top-level files that are part of the shared engine. */
const ENGINE_FILES = new Set([
    "index.ts",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "tsconfig.typecheck.json",
    "vitest.config.js",
    "AGENTS.md",
    "CLAUDE.md",
    ".env.example",
]);

/** Prefixes that are shared engine code/automation. */
const ENGINE_PREFIXES = [
    "lib/",
    "scripts/",
    "web/",
    "skills/",
    ".github/",
    "infra/",
];

export function classifyPath(path: string): PathClass {
    if (CONFIG_FILES.has(path)) return "config";
    if (CONTENT_FILES.has(path)) return "content";
    for (const p of CONTENT_PREFIXES) if (path.startsWith(p)) return "content";

    // docs/ is mixed: top-level design docs (docs/foo.md, docs/plans/*) are
    // engine; the candidate/discovery subtrees were already caught above.
    if (path.startsWith("docs/") && path.endsWith(".md")) return "engine";

    if (ENGINE_FILES.has(path)) return "engine";
    for (const p of ENGINE_PREFIXES) if (path.startsWith(p)) return "engine";

    return "skip";
}

/**
 * lib/geocoder.ts carries Seattle lookup tables (content) interleaved with
 * engine logic, so it always shows as modified on a copy. Surface it, but flag
 * it so the owner takes the logic and not the Seattle tables.
 */
export const MIXED_ENGINE_FILES = new Set(["lib/geocoder.ts"]);

// ---------------------------------------------------------------------------
// Feature grouping
// ---------------------------------------------------------------------------

export interface DiffEntry {
    /** A=added upstream (absent locally), M=modified, D=deleted upstream. */
    status: "A" | "M" | "D";
    path: string;
}

export interface UpstreamCommit {
    sha: string;
    subject: string;
    /** Files this commit touched, as reported by git. */
    files: string[];
}

export interface Feature {
    /** Stable id: the design-doc path, or `commit:<slug>` for doc-less ones. */
    id: string;
    title: string;
    kind: "doc" | "commit" | "minor";
    /** Anchoring upstream commit sha, when known. */
    sha?: string;
    /** Engine files this feature would bring in, with their diff status. */
    files: DiffEntry[];
    /** True when any file needs careful hand-merge (e.g. mixed content). */
    needsCarefulMerge: boolean;
}

const slugify = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/** A doc-less feature is "minor" when it only touches dependency/lock churn. */
const MINOR_ONLY_FILES = new Set([
    "package.json",
    "package-lock.json",
    "web/package.json",
    "web/package-lock.json",
]);

/**
 * Cluster the engine delta into features.
 *
 * @param diff         engine-only file delta between local HEAD and the ref
 * @param upstreamLog  upstream commits newest-first, each with its touched
 *                     files; used to find the commit that owns each file
 */
export function groupFeatures(diff: DiffEntry[], upstreamLog: UpstreamCommit[]): Feature[] {
    // Map each differing path to the newest upstream commit that touched it.
    const ownerOf = new Map<string, UpstreamCommit>();
    for (const entry of diff) {
        for (const commit of upstreamLog) {
            if (commit.files.includes(entry.path)) {
                ownerOf.set(entry.path, commit);
                break;
            }
        }
    }

    // Bucket the diff entries by owning commit (or "__orphan__" when no commit
    // in the provided log claims the file — e.g. a shallow log).
    const byCommit = new Map<string, DiffEntry[]>();
    for (const entry of diff) {
        const key = ownerOf.get(entry.path)?.sha ?? "__orphan__";
        const bucket = byCommit.get(key) ?? [];
        bucket.push(entry);
        byCommit.set(key, bucket);
    }

    const features: Feature[] = [];
    const minorFiles: DiffEntry[] = [];

    for (const [sha, files] of byCommit) {
        const commit = upstreamLog.find(c => c.sha === sha);
        const careful = files.some(f => MIXED_ENGINE_FILES.has(f.path));

        // 1. Design-doc anchored: prefer a freshly added/modified design doc.
        const doc = files.find(f => f.path.startsWith("docs/") && f.path.endsWith(".md"));
        if (doc) {
            features.push({
                id: doc.path,
                title: doc.path.replace(/^docs\//, "").replace(/\.md$/, ""),
                kind: "doc",
                sha: commit?.sha,
                files,
                needsCarefulMerge: careful,
            });
            continue;
        }

        // 3. Minor: doc-less and only dependency/lock churn — defer to one bucket.
        if (files.every(f => MINOR_ONLY_FILES.has(f.path))) {
            minorFiles.push(...files);
            continue;
        }

        // 2. Squash-commit anchored: name by the owning commit's subject.
        const subject = commit?.subject ?? "Engine changes (no upstream commit found)";
        features.push({
            id: commit ? `commit:${slugify(subject)}` : `orphan:${slugify(files[0].path)}`,
            title: subject,
            kind: "commit",
            sha: commit?.sha,
            files,
            needsCarefulMerge: careful,
        });
    }

    if (minorFiles.length) {
        features.push({
            id: "minor:dependency-and-config-churn",
            title: "Minor dependency / config updates",
            kind: "minor",
            files: minorFiles,
            needsCarefulMerge: false,
        });
    }

    // Stable, useful order: docs first, then commits, then minor; richer
    // features (more files) ahead of thinner ones within a kind.
    const kindRank = { doc: 0, commit: 1, minor: 2 } as const;
    return features.sort(
        (a, b) => kindRank[a.kind] - kindRank[b.kind] || b.files.length - a.files.length,
    );
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export interface Ledger {
    upstreamRepo: string;
    /** Upstream sha at the last reconciliation, for reporting. */
    lastSyncedSha: string | null;
    decisions: Record<
        string,
        { decision: "merged" | "skipped" | "deferred"; sha?: string; decidedAt: string; pr?: number }
    >;
}

export const EMPTY_LEDGER: Ledger = {
    upstreamRepo: "prestomation/206events",
    lastSyncedSha: null,
    decisions: {},
};

/** Drop features already decided, unless the anchoring commit advanced. */
export function filterDecided(features: Feature[], ledger: Ledger): Feature[] {
    return features.filter(f => {
        const prior = ledger.decisions[f.id];
        if (!prior) return true;
        if (prior.decision === "merged") return false;
        // A deferred/skipped feature resurfaces only if upstream moved it on.
        return Boolean(f.sha && prior.sha && f.sha !== prior.sha);
    });
}

// ---------------------------------------------------------------------------
// CLI (git glue, untested — the logic above is unit-tested)
// ---------------------------------------------------------------------------

const NUL = String.fromCharCode(0);

const git = (...args: string[]) =>
    execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();

function readDiff(ref: string): DiffEntry[] {
    // -M so renames don't show as add+delete pairs.
    const out = git("diff", "--name-status", "-M", "HEAD", ref);
    const entries: DiffEntry[] = [];
    for (const line of out.split("\n").filter(Boolean)) {
        const parts = line.split("\t");
        const path = parts[parts.length - 1];
        const status = parts[0][0] as DiffEntry["status"];
        if (status !== "A" && status !== "M" && status !== "D") continue;
        if (classifyPath(path) !== "engine") continue;
        // "A" in `git diff HEAD ref` means present in ref, absent in HEAD.
        entries.push({ status, path });
    }
    return entries;
}

function readUpstreamLog(ref: string, limit = 600): UpstreamCommit[] {
    // Each record is `<NUL><sha><NUL><subject>\n<file>\n<file>…`. Splitting the
    // whole stream on NUL yields ["", sha, subject+files, sha, subject+files…].
    const raw = git("log", `-n${limit}`, "--name-only", "--format=%x00%H%x00%s", ref);
    const tokens = raw.split(NUL);
    const commits: UpstreamCommit[] = [];
    for (let i = 1; i + 1 < tokens.length; i += 2) {
        const sha = tokens[i].replace(/\s+/g, "");
        const rest = tokens[i + 1].replace(/^\n/, "");
        const nl = rest.indexOf("\n");
        const subject = (nl === -1 ? rest : rest.slice(0, nl)).trim();
        const files =
            nl === -1 ? [] : rest.slice(nl + 1).split("\n").map(f => f.trim()).filter(Boolean);
        commits.push({ sha, subject, files });
    }
    return commits;
}

function loadLedger(): Ledger {
    try {
        return { ...EMPTY_LEDGER, ...JSON.parse(readFileSync("feature-sync.json", "utf8")) };
    } catch {
        return { ...EMPTY_LEDGER };
    }
}

function printHuman(features: Feature[], ref: string): void {
    if (!features.length) {
        console.log(`No new upstream engine features against ${ref}. You're up to date.`);
        return;
    }
    console.log(`${features.length} candidate feature(s) from ${ref}:\n`);
    for (const f of features) {
        const tag = f.kind === "doc" ? "[doc]" : f.kind === "minor" ? "[minor]" : "[feat]";
        console.log(`${tag} ${f.title}`);
        console.log(`    id: ${f.id}${f.sha ? `  sha: ${f.sha.slice(0, 10)}` : ""}`);
        if (f.needsCarefulMerge)
            console.log(`    ! contains a mixed engine/content file — hand-merge the logic only`);
        for (const file of f.files.slice(0, 12)) console.log(`      ${file.status}  ${file.path}`);
        if (f.files.length > 12) console.log(`      … and ${f.files.length - 12} more`);
        console.log("");
    }
}

async function main() {
    const argv = process.argv.slice(2);
    const asJson = argv.includes("--json");
    const includeAll = argv.includes("--all");
    const refFlag = argv.indexOf("--ref");
    const ref = refFlag !== -1 ? argv[refFlag + 1] : "upstream/main";

    let diff: DiffEntry[];
    try {
        diff = readDiff(ref);
    } catch {
        console.error(
            `Could not diff against ${ref}. Add and fetch the upstream remote first:\n` +
                `  git remote add upstream https://github.com/prestomation/206events\n` +
                `  git fetch upstream main`,
        );
        process.exit(1);
        return;
    }

    const log = readUpstreamLog(ref);
    const all = groupFeatures(diff, log);
    const ledger = loadLedger();
    const features = includeAll ? all : filterDecided(all, ledger);
    let refSha: string | null = null;
    try {
        refSha = git("rev-parse", ref);
    } catch {
        refSha = null;
    }

    if (asJson) {
        console.log(JSON.stringify({ ref, refSha, ledger, features }, null, 2));
    } else {
        printHuman(features, ref);
    }
}

// Run only as a CLI, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
