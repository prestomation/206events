import { describe, it, expect } from "vitest";
import {
    classifyPath,
    groupFeatures,
    filterDecided,
    parseGitLog,
    engineFilesFromCommits,
    selectCandidates,
    EMPTY_LEDGER,
    type DiffEntry,
    type UpstreamCommit,
    type Ledger,
} from "./feature-sync.js";

const NUL = String.fromCharCode(0);

describe("classifyPath", () => {
    it("treats shared engine code/automation as engine", () => {
        for (const p of [
            "lib/calendar_ripper.ts",
            "web/src/App.jsx",
            "scripts/check-discovery-api.ts",
            "skills/build-report/SKILL.md",
            ".github/workflows/build-calendars.yml",
            "infra/favorites-worker/src/feed.ts",
            "index.ts",
            "package.json",
            "AGENTS.md",
        ]) {
            expect(classifyPath(p)).toBe("engine");
        }
    });

    it("treats top-level design docs as engine but candidate/discovery docs as content", () => {
        expect(classifyPath("docs/upstream-feature-sync.md")).toBe("engine");
        expect(classifyPath("docs/plans/something.md")).toBe("engine");
        expect(classifyPath("docs/source-candidates/foo.md")).toBe("content");
        expect(classifyPath("docs/discovery-log/2026-01-01.md")).toBe("content");
    });

    it("treats per-city content as content", () => {
        for (const p of [
            "sources/stoup/ripper.yaml",
            "sources/recurring/foo.yaml",
            "allowed-removals/tag-music.ics",
            "event-uncertainty-cache.json",
            "geo-cache.json",
            "ideas.md",
            "README.md",
        ]) {
            expect(classifyPath(p)).toBe("content");
        }
    });

    it("treats the city config and the ledger as config", () => {
        expect(classifyPath("city.config.ts")).toBe("config");
        expect(classifyPath("feature-sync.json")).toBe("config");
    });

    it("skips everything else", () => {
        expect(classifyPath("LICENSE")).toBe("skip");
        expect(classifyPath("node_modules/foo/index.js")).toBe("skip");
    });
});

describe("groupFeatures", () => {
    const commits: UpstreamCommit[] = [
        // newest first
        {
            sha: "c3",
            subject: "Add geo-subscribe UI",
            files: ["docs/design-geo-subscribe.md", "web/src/components/GeoSubscribe.jsx", "lib/geo.ts"],
        },
        {
            sha: "c2",
            subject: "Fix dice ripper timezone handling",
            files: ["lib/config/dice.ts", "lib/config/dice.test.ts"],
        },
        {
            sha: "c1",
            subject: "Bump dependencies",
            files: ["package.json", "package-lock.json"],
        },
    ];

    it("anchors a feature on its design doc and bundles the commit's engine files", () => {
        const diff: DiffEntry[] = [
            { status: "A", path: "docs/design-geo-subscribe.md" },
            { status: "A", path: "web/src/components/GeoSubscribe.jsx" },
            { status: "M", path: "lib/geo.ts" },
        ];
        const features = groupFeatures(diff, commits);
        expect(features).toHaveLength(1);
        expect(features[0].kind).toBe("doc");
        expect(features[0].id).toBe("docs/design-geo-subscribe.md");
        expect(features[0].sha).toBe("c3");
        expect(features[0].files.map(f => f.path)).toContain("lib/geo.ts");
    });

    it("anchors a doc-less feature on its squash-commit subject", () => {
        const diff: DiffEntry[] = [
            { status: "M", path: "lib/config/dice.ts" },
            { status: "M", path: "lib/config/dice.test.ts" },
        ];
        const features = groupFeatures(diff, commits);
        expect(features).toHaveLength(1);
        expect(features[0].kind).toBe("commit");
        expect(features[0].title).toBe("Fix dice ripper timezone handling");
        expect(features[0].id).toBe("commit:fix-dice-ripper-timezone-handling");
        expect(features[0].sha).toBe("c2");
    });

    it("collapses dependency/lock churn into one minor bucket", () => {
        const diff: DiffEntry[] = [
            { status: "M", path: "package.json" },
            { status: "M", path: "package-lock.json" },
        ];
        const features = groupFeatures(diff, commits);
        expect(features).toHaveLength(1);
        expect(features[0].kind).toBe("minor");
        expect(features[0].id).toBe("minor:dependency-and-config-churn");
    });

    it("orders docs first, then commits, then minor", () => {
        const diff: DiffEntry[] = [
            { status: "M", path: "package.json" },
            { status: "M", path: "package-lock.json" },
            { status: "M", path: "lib/config/dice.ts" },
            { status: "A", path: "docs/design-geo-subscribe.md" },
        ];
        const kinds = groupFeatures(diff, commits).map(f => f.kind);
        expect(kinds).toEqual(["doc", "commit", "minor"]);
    });

    it("flags mixed engine/content files for careful merge", () => {
        const log: UpstreamCommit[] = [
            { sha: "g1", subject: "Improve geocoder fallback", files: ["lib/geocoder.ts"] },
        ];
        const diff: DiffEntry[] = [{ status: "M", path: "lib/geocoder.ts" }];
        const features = groupFeatures(diff, log);
        expect(features[0].needsCarefulMerge).toBe(true);
    });

    it("keeps files whose owning commit is absent from the log as an orphan feature", () => {
        const diff: DiffEntry[] = [{ status: "M", path: "lib/mystery.ts" }];
        const features = groupFeatures(diff, commits);
        expect(features).toHaveLength(1);
        expect(features[0].id).toBe("orphan:lib-mystery-ts");
        expect(features[0].sha).toBeUndefined();
    });
});

describe("parseGitLog", () => {
    it("parses NUL-delimited log records into commits with files", () => {
        // Mirrors `git log --name-only --format=%x00%H%x00%s` output.
        const raw =
            `${NUL}abc123${NUL}Add geo-subscribe UI\n` +
            `docs/design-geo-subscribe.md\nweb/src/GeoSubscribe.jsx\n\n` +
            `${NUL}def456${NUL}Bump deps\npackage.json\npackage-lock.json`;
        const commits = parseGitLog(raw);
        expect(commits).toHaveLength(2);
        expect(commits[0]).toEqual({
            sha: "abc123",
            subject: "Add geo-subscribe UI",
            files: ["docs/design-geo-subscribe.md", "web/src/GeoSubscribe.jsx"],
        });
        expect(commits[1].files).toEqual(["package.json", "package-lock.json"]);
    });

    it("handles a commit that touched no files", () => {
        const raw = `${NUL}abc${NUL}Empty merge commit`;
        const commits = parseGitLog(raw);
        expect(commits).toHaveLength(1);
        expect(commits[0].files).toEqual([]);
    });

    it("returns nothing for empty output", () => {
        expect(parseGitLog("")).toEqual([]);
    });
});

describe("engineFilesFromCommits", () => {
    it("keeps only engine files and dedupes across commits", () => {
        const commits: UpstreamCommit[] = [
            { sha: "a", subject: "x", files: ["lib/a.ts", "sources/v/ripper.yaml", "web/b.js"] },
            { sha: "b", subject: "y", files: ["lib/a.ts", "geo-cache.json", "city.config.ts"] },
        ];
        expect([...engineFilesFromCommits(commits)].sort()).toEqual(["lib/a.ts", "web/b.js"]);
    });
});

describe("selectCandidates", () => {
    it("keeps candidate files that still differ and drops already-merged ones", () => {
        const candidates = new Set(["lib/a.ts", "web/b.js", "lib/already-have.ts"]);
        const status = new Map<string, DiffEntry["status"]>([
            ["lib/a.ts", "M"],
            ["web/b.js", "A"],
            // lib/already-have.ts is absent => identical to upstream => dropped
            ["sources/x.yaml", "M"], // not a candidate => ignored
        ]);
        const diff = selectCandidates(candidates, status);
        expect(diff.sort((a, b) => a.path.localeCompare(b.path))).toEqual([
            { status: "M", path: "lib/a.ts" },
            { status: "A", path: "web/b.js" },
        ]);
    });
});

describe("filterDecided", () => {
    const feature = (id: string, sha?: string) => ({
        id,
        title: id,
        kind: "doc" as const,
        sha,
        files: [],
        needsCarefulMerge: false,
    });

    const ledger = (decisions: Ledger["decisions"]): Ledger => ({ ...EMPTY_LEDGER, decisions });

    it("drops merged features permanently", () => {
        const l = ledger({ "docs/a.md": { decision: "merged", sha: "x", decidedAt: "t" } });
        expect(filterDecided([feature("docs/a.md", "x")], l)).toHaveLength(0);
    });

    it("keeps undecided features", () => {
        expect(filterDecided([feature("docs/new.md", "x")], EMPTY_LEDGER)).toHaveLength(1);
    });

    it("resurfaces a skipped feature only when upstream advanced its commit", () => {
        const l = ledger({ "docs/a.md": { decision: "skipped", sha: "old", decidedAt: "t" } });
        expect(filterDecided([feature("docs/a.md", "old")], l)).toHaveLength(0);
        expect(filterDecided([feature("docs/a.md", "new")], l)).toHaveLength(1);
    });
});
