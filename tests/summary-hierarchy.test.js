import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const mockChatMetadata = {};
vi.mock('../../../st-context.js', () => ({
    getContext: vi.fn(() => ({
        chatMetadata: mockChatMetadata,
        saveMetadataDebounced: vi.fn(),
        chat: [],
    })),
}));
vi.mock('../agent-utils.js', () => ({
    getChatId: vi.fn(() => 'test-chat'),
    generateAnalytical: vi.fn(() => ''),
}));
vi.mock('../entry-manager.js', () => ({
    createEntry: vi.fn(async (_book, opts) => ({ uid: 999, comment: opts.comment, nodeLabel: 'Test' })),
    getCachedWorldInfo: vi.fn(async () => ({ entries: {} })),
    parseJsonFromLLM: vi.fn(() => ({})),
    buildSummaryKeys: vi.fn(() => ['key1', 'key2']),
    findEntryByUid: vi.fn(() => null),
    KEYWORD_RULES: 'KEYWORD RULES (test stub)',
    SUMMARY_STYLE_RULES: 'SUMMARY STYLE RULES (test stub)',
}));
vi.mock('../tree-store.js', () => ({
    getTree: vi.fn(() => ({ root: { id: 'root', children: [{ id: 'summ', label: 'Summaries', children: [], entryUids: [] }], entryUids: [] } })),
    saveTree: vi.fn(),
    createTreeNode: vi.fn((label, summary) => ({ id: `node_${label}`, label, summary, children: [], entryUids: [] })),
    addEntryToNode: vi.fn(),
    findNodeById: vi.fn((root, id) => {
        if (id === 'summ') return root.children[0];
        for (const c of (root.children[0]?.children || [])) {
            if (c.id === id) return c;
        }
        return null;
    }),
    ensureSummariesNode: vi.fn(() => 'summ'),
    isSummaryTitle: vi.fn((t) => /^\[(?:scene\s+|act\s+|story\s+)?summary/i.test(t || '')),
}));
vi.mock('../background-events.js', () => ({
    addBackgroundEvent: vi.fn(),
}));
vi.mock('../../../world-info.js', () => ({
    saveWorldInfo: vi.fn(),
}));

import {
    getHierarchyState,
    isActSummaryTitle,
    isStorySummaryTitle,
    isRolledUpSummary,
    registerSceneSummary,
    getStorySummaryUid,
    getActSummaryUids,
    getRolledUpSceneUids,
    rollupActSummary,
    rollupStorySummary,
} from '../summary-hierarchy.js';

import { generateAnalytical } from '../agent-utils.js';
import { getCachedWorldInfo, parseJsonFromLLM, createEntry, findEntryByUid } from '../entry-manager.js';
import { addBackgroundEvent } from '../background-events.js';

const META_KEY = 'tunnelvision_summary_hierarchy';

beforeEach(() => {
    for (const key of Object.keys(mockChatMetadata)) delete mockChatMetadata[key];
    vi.clearAllMocks();
});

// ── Title detection ──────────────────────────────────────────────

describe('isActSummaryTitle', () => {
    it('matches [Act Summary] prefix', () => {
        expect(isActSummaryTitle('[Act Summary] Act 1: The Beginning')).toBe(true);
    });
    it('rejects scene summaries', () => {
        expect(isActSummaryTitle('[Summary] A scene')).toBe(false);
        expect(isActSummaryTitle('[Scene Summary] Something')).toBe(false);
    });
    it('rejects null/empty', () => {
        expect(isActSummaryTitle(null)).toBe(false);
        expect(isActSummaryTitle('')).toBe(false);
    });
});

describe('isStorySummaryTitle', () => {
    it('matches [Story Summary] prefix', () => {
        expect(isStorySummaryTitle('[Story Summary] Story So Far')).toBe(true);
    });
    it('rejects act summaries', () => {
        expect(isStorySummaryTitle('[Act Summary] Act 1')).toBe(false);
    });
});

describe('isRolledUpSummary', () => {
    it('returns true for act or story summaries', () => {
        expect(isRolledUpSummary('[Act Summary] Act 1')).toBe(true);
        expect(isRolledUpSummary('[Story Summary] Full story')).toBe(true);
    });
    it('returns false for regular summaries', () => {
        expect(isRolledUpSummary('[Summary] A scene')).toBe(false);
    });
});

// ── Hierarchy state ──────────────────────────────────────────────

describe('getHierarchyState', () => {
    it('returns default state when no metadata exists', () => {
        const state = getHierarchyState();
        expect(state.currentActNumber).toBe(1);
        expect(state.currentActSceneUids).toEqual([]);
        expect(state.rolledUpSceneUids).toEqual([]);
        expect(state.actSummaryUids).toEqual([]);
        expect(state.storySummaryUid).toBeNull();
    });

    it('returns stored state from metadata', () => {
        mockChatMetadata[META_KEY] = {
            currentActNumber: 3,
            currentActSceneUids: [10, 20],
            rolledUpSceneUids: [1, 2, 3],
            actSummaryUids: [100, 200],
            storySummaryUid: 500,
            lastRollupAt: 12345,
        };
        const state = getHierarchyState();
        expect(state.currentActNumber).toBe(3);
        expect(state.actSummaryUids).toEqual([100, 200]);
        expect(state.storySummaryUid).toBe(500);
    });

    it('backfills missing rolledUpSceneUids field', () => {
        mockChatMetadata[META_KEY] = {
            currentActNumber: 2,
            currentActSceneUids: [],
            actSummaryUids: [],
            storySummaryUid: null,
            lastRollupAt: 0,
        };
        const state = getHierarchyState();
        expect(state.rolledUpSceneUids).toEqual([]);
    });
});

// ── Scene registration ───────────────────────────────────────────

describe('registerSceneSummary', () => {
    it('adds UID to current act scenes', () => {
        registerSceneSummary(42);
        const state = getHierarchyState();
        expect(state.currentActSceneUids).toContain(42);
    });

    it('does not duplicate UIDs', () => {
        registerSceneSummary(42);
        registerSceneSummary(42);
        const state = getHierarchyState();
        expect(state.currentActSceneUids.filter(u => u === 42)).toHaveLength(1);
    });

    it('returns false when under threshold', () => {
        expect(registerSceneSummary(1)).toBe(false);
        expect(registerSceneSummary(2)).toBe(false);
    });

    it('returns true when reaching SCENES_PER_ACT threshold', () => {
        for (let i = 1; i <= 9; i++) registerSceneSummary(i);
        expect(registerSceneSummary(10)).toBe(true);
    });
});

// ── Query helpers ────────────────────────────────────────────────

describe('getStorySummaryUid', () => {
    it('returns null by default', () => {
        expect(getStorySummaryUid()).toBeNull();
    });

    it('returns stored UID', () => {
        mockChatMetadata[META_KEY] = {
            currentActNumber: 1,
            currentActSceneUids: [],
            rolledUpSceneUids: [],
            actSummaryUids: [],
            storySummaryUid: 777,
            lastRollupAt: 0,
        };
        expect(getStorySummaryUid()).toBe(777);
    });
});

describe('getRolledUpSceneUids', () => {
    it('returns empty set by default', () => {
        expect(getRolledUpSceneUids().size).toBe(0);
    });

    it('returns set of rolled-up UIDs', () => {
        mockChatMetadata[META_KEY] = {
            currentActNumber: 2,
            currentActSceneUids: [],
            rolledUpSceneUids: [1, 2, 3, 4, 5],
            actSummaryUids: [100],
            storySummaryUid: null,
            lastRollupAt: 0,
        };
        const set = getRolledUpSceneUids();
        expect(set.size).toBe(5);
        expect(set.has(3)).toBe(true);
    });
});

// ── Act rollup ───────────────────────────────────────────────────

describe('rollupActSummary', () => {
    it('returns null when too few scenes', async () => {
        mockChatMetadata[META_KEY] = {
            currentActNumber: 1,
            currentActSceneUids: [1, 2],
            rolledUpSceneUids: [],
            actSummaryUids: [],
            storySummaryUid: null,
            lastRollupAt: 0,
        };
        const result = await rollupActSummary('testBook');
        expect(result).toBeNull();
    });

    it('performs rollup when enough scenes exist', async () => {
        const sceneUids = [10, 20, 30];
        mockChatMetadata[META_KEY] = {
            currentActNumber: 1,
            currentActSceneUids: sceneUids,
            rolledUpSceneUids: [],
            actSummaryUids: [],
            storySummaryUid: null,
            lastRollupAt: 0,
        };

        const mockEntries = {};
        sceneUids.forEach((uid, i) => {
            mockEntries[`e${i}`] = {
                uid,
                comment: `[Summary] Scene ${i + 1}`,
                content: `Scene ${i + 1} content`,
                disable: false,
            };
        });

        getCachedWorldInfo.mockResolvedValue({ entries: mockEntries });
        findEntryByUid.mockImplementation((entries, uid) => {
            for (const key of Object.keys(entries)) {
                if (entries[key].uid === uid) return entries[key];
            }
            return null;
        });

        parseJsonFromLLM.mockReturnValue({
            title: 'Act 1: The Beginning',
            summary: 'Things happened across three scenes.',
            participants: ['Alice', 'Bob'],
            keys: ['alice', 'bob', 'beginning', 'forest'],
            significance: 'major',
            when_start: 'Morning, Day 1',
            when_end: 'Evening, Day 1',
        });

        generateAnalytical.mockResolvedValue('{"title":"Act 1: The Beginning","summary":"Things happened."}');
        createEntry.mockResolvedValue({ uid: 999, comment: '[Act Summary] Act 1: The Beginning' });

        const result = await rollupActSummary('testBook');

        expect(result).not.toBeNull();
        expect(result.title).toBe('Act 1: The Beginning');
        expect(createEntry).toHaveBeenCalledWith('testBook', expect.objectContaining({
            comment: '[Act Summary] Act 1: The Beginning',
            background: true,
        }));
        expect(addBackgroundEvent).toHaveBeenCalled();

        // State should advance to next act
        const state = getHierarchyState();
        expect(state.currentActNumber).toBe(2);
        expect(state.currentActSceneUids).toEqual([]);
        expect(state.actSummaryUids).toContain(999);
        expect(state.rolledUpSceneUids).toEqual(expect.arrayContaining(sceneUids));
    });
});

// ── Story rollup ─────────────────────────────────────────────────

describe('rollupStorySummary', () => {
    it('returns null when no act summaries exist', async () => {
        mockChatMetadata[META_KEY] = {
            currentActNumber: 1,
            currentActSceneUids: [],
            rolledUpSceneUids: [],
            actSummaryUids: [],
            storySummaryUid: null,
            lastRollupAt: 0,
        };
        const result = await rollupStorySummary('testBook');
        expect(result).toBeNull();
    });

    it('creates story summary from act summaries', async () => {
        mockChatMetadata[META_KEY] = {
            currentActNumber: 2,
            currentActSceneUids: [],
            rolledUpSceneUids: [1, 2, 3],
            actSummaryUids: [100],
            storySummaryUid: null,
            lastRollupAt: 0,
        };

        const actEntry = {
            uid: 100,
            comment: '[Act Summary] Act 1: The Beginning',
            content: 'Act 1 stuff happened.',
            disable: false,
        };

        getCachedWorldInfo.mockResolvedValue({ entries: { e1: actEntry } });
        findEntryByUid.mockImplementation((entries, uid) => {
            if (uid === 100) return actEntry;
            return null;
        });

        parseJsonFromLLM.mockReturnValue({
            title: 'Story So Far: An Epic Tale',
            summary: 'The full story so far.',
            participants: ['Alice', 'Bob'],
            keys: ['alice', 'bob', 'epic'],
            significance: 'critical',
        });

        generateAnalytical.mockResolvedValue('{"title":"Story So Far","summary":"The full story."}');
        createEntry.mockResolvedValue({ uid: 888, comment: '[Story Summary] Story So Far' });

        const result = await rollupStorySummary('testBook');

        expect(result).not.toBeNull();
        expect(result.uid).toBe(888);
        expect(createEntry).toHaveBeenCalledWith('testBook', expect.objectContaining({
            comment: '[Story Summary] Story So Far: An Epic Tale',
            background: true,
        }));

        const state = getHierarchyState();
        expect(state.storySummaryUid).toBe(888);
    });
});

// buildSummaryKeys is tested in entry-manager.test.js (pure function, no mocking needed)
