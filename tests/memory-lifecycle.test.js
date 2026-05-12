import { describe, it, expect, vi } from 'vitest';

// Mock transitive dependencies
vi.mock('../tree-store.js', () => ({
    getSettings: vi.fn(() => ({ lifecycleInterval: 30 })),
    getTree: vi.fn(() => null),
    saveTree: vi.fn(),
    createTreeNode: vi.fn(),
    addEntryToNode: vi.fn(),
    removeEntryFromTree: vi.fn(),
    getAllEntryUids: vi.fn(() => []),
    isSummaryTitle: vi.fn((t) => t?.includes('[Summary]')),
    isTrackerTitle: vi.fn((t) => t?.startsWith('[Tracker]')),
    getTrackerUids: vi.fn(() => new Map()),
}));
vi.mock('../tool-registry.js', () => ({
    getActiveTunnelVisionBooks: vi.fn(() => []),
}));
vi.mock('../entry-manager.js', () => ({
    getCachedWorldInfo: vi.fn(),
    buildUidMap: vi.fn(() => new Map()),
    parseJsonFromLLM: vi.fn(() => ({})),
    invalidateWorldInfoCache: vi.fn(),
    mergeEntries: vi.fn(),
    findEntryByUid: vi.fn(),
    updateEntry: vi.fn(),
    forgetEntry: vi.fn(),
    recordEntryVersion: vi.fn(),
    getEntryTurnIndex: vi.fn(),
    setEntrySupersedes: vi.fn(),
}));
vi.mock('../agent-utils.js', () => ({
    getChatId: vi.fn(() => 'test-chat'),
    callWithRetry: vi.fn(),
    generateAnalytical: vi.fn(),
    shouldSkipAiMessage: vi.fn(() => false),
    trigramSimilarity: vi.fn(() => 0),
    trigrams: vi.fn(() => new Set()),
}));
vi.mock('../background-events.js', () => ({
    addBackgroundEvent: vi.fn(),
    registerBackgroundTask: vi.fn(() => ({ cancelled: false, end: vi.fn(), fail: vi.fn(), _ended: false })),
}));
vi.mock('../world-state.js', () => ({
    getWorldStateText: vi.fn(() => ''),
}));

import { computeAdaptiveInterval } from '../memory-lifecycle.js';

// ── computeAdaptiveInterval ─────────────────────────────────────

describe('computeAdaptiveInterval', () => {
    it('returns base interval when no last result exists', () => {
        expect(computeAdaptiveInterval({ lifecycleInterval: 30 }, null)).toBe(30);
        expect(computeAdaptiveInterval({ lifecycleInterval: 30 }, {})).toBe(30);
    });

    it('uses default base interval of 30 if setting is missing', () => {
        expect(computeAdaptiveInterval({}, null)).toBe(30);
    });

    it('relaxes interval when last run found no work', () => {
        const state = {
            lastResult: {
                duplicatesMerged: 0,
                entriesCompressed: 0,
                entriesReorganized: 0,
                duplicatesFound: 0,
                contradictionsFound: 0,
                crossValidationContradictions: 0,
            },
        };
        const interval = computeAdaptiveInterval({ lifecycleInterval: 30 }, state);
        expect(interval).toBe(45); // 30 * 1.5
    });

    it('tightens interval when many duplicates were found', () => {
        const state = {
            lastResult: {
                duplicatesMerged: 0,
                entriesCompressed: 0,
                entriesReorganized: 0,
                duplicatesFound: 6,
                contradictionsFound: 0,
                crossValidationContradictions: 0,
            },
        };
        const interval = computeAdaptiveInterval({ lifecycleInterval: 30 }, state);
        expect(interval).toBeLessThan(30);
    });

    it('tightens interval when high work was done', () => {
        const state = {
            lastResult: {
                duplicatesMerged: 5,
                entriesCompressed: 4,
                entriesReorganized: 0,
                duplicatesFound: 0,
                contradictionsFound: 0,
                crossValidationContradictions: 0,
            },
        };
        const interval = computeAdaptiveInterval({ lifecycleInterval: 30 }, state);
        expect(interval).toBeLessThan(30);
    });

    it('tightens further with contradictions', () => {
        const state = {
            lastResult: {
                duplicatesMerged: 0,
                entriesCompressed: 0,
                entriesReorganized: 0,
                duplicatesFound: 3,
                contradictionsFound: 2,
                crossValidationContradictions: 0,
            },
        };
        const dupsOnly = computeAdaptiveInterval({ lifecycleInterval: 30 }, {
            lastResult: { ...state.lastResult, contradictionsFound: 0 },
        });
        const withContradictions = computeAdaptiveInterval({ lifecycleInterval: 30 }, state);
        expect(withContradictions).toBeLessThan(dupsOnly);
    });

    it('never goes below minimum (10)', () => {
        const state = {
            lastResult: {
                duplicatesMerged: 10,
                entriesCompressed: 10,
                entriesReorganized: 10,
                duplicatesFound: 10,
                contradictionsFound: 10,
                crossValidationContradictions: 10,
            },
        };
        const interval = computeAdaptiveInterval({ lifecycleInterval: 30 }, state);
        expect(interval).toBeGreaterThanOrEqual(10);
    });

    it('never goes above maximum (60)', () => {
        const state = {
            lastResult: {
                duplicatesMerged: 0,
                entriesCompressed: 0,
                entriesReorganized: 0,
                duplicatesFound: 0,
                contradictionsFound: 0,
                crossValidationContradictions: 0,
            },
        };
        const interval = computeAdaptiveInterval({ lifecycleInterval: 100 }, state);
        expect(interval).toBeLessThanOrEqual(60);
    });

    it('combines multiple pressure factors multiplicatively', () => {
        const state = {
            lastResult: {
                duplicatesMerged: 5,
                entriesCompressed: 5,
                entriesReorganized: 0,
                duplicatesFound: 5,
                contradictionsFound: 1,
                crossValidationContradictions: 0,
            },
        };
        // workDone=10 → *0.5, dupsFound=5 → *0.5, contradictions=1 → *0.8
        // factor = 0.5 * 0.5 * 0.8 = 0.2, interval = 30 * 0.2 = 6 → clamped to 10
        const interval = computeAdaptiveInterval({ lifecycleInterval: 30 }, state);
        expect(interval).toBe(10);
    });

    it('handles moderate activity (between thresholds)', () => {
        const state = {
            lastResult: {
                duplicatesMerged: 1,
                entriesCompressed: 1,
                entriesReorganized: 0,
                duplicatesFound: 1,
                contradictionsFound: 0,
                crossValidationContradictions: 0,
            },
        };
        // workDone=2 → *0.85, dupsFound=1 → no change (needs >=2), no contradictions
        // totalWork=3, so no quiet bonus
        const interval = computeAdaptiveInterval({ lifecycleInterval: 30 }, state);
        expect(interval).toBe(Math.round(30 * 0.85)); // 26
    });
});
