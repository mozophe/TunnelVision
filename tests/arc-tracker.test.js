import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the context so arc state is stored in a local object
const mockMetadata = {};
const mockChat = [];
vi.mock('../../../st-context.js', () => ({
    getContext: () => ({
        chatMetadata: mockMetadata,
        chat: mockChat,
        saveMetadataDebounced: vi.fn(),
    }),
}));

import { processArcUpdates, getActiveArcs, getAllArcs, buildArcsSummary, buildArcsContextBlock } from '../arc-tracker.js';

beforeEach(() => {
    delete mockMetadata.tunnelvision_arcs;
    mockChat.length = 0;
});

// ── processArcUpdates ────────────────────────────────────────────

describe('processArcUpdates', () => {
    it('returns zeroes for empty input', () => {
        expect(processArcUpdates([])).toEqual({ created: 0, updated: 0, resolved: 0 });
    });

    it('returns zeroes for null input', () => {
        expect(processArcUpdates(null)).toEqual({ created: 0, updated: 0, resolved: 0 });
    });

    it('creates a new arc when id is null', () => {
        const result = processArcUpdates([
            { id: null, title: 'The Quest', status: 'active', progression: 'Started the journey' },
        ]);
        expect(result.created).toBe(1);
        expect(result.updated).toBe(0);

        const arcs = getAllArcs();
        expect(arcs).toHaveLength(1);
        expect(arcs[0].title).toBe('The Quest');
        expect(arcs[0].status).toBe('active');
        expect(arcs[0].progression).toBe('Started the journey');
        expect(arcs[0].id).toMatch(/^arc_/);
        expect(arcs[0].history).toEqual([]);
    });

    it('creates multiple arcs in one call', () => {
        const result = processArcUpdates([
            { id: null, title: 'Arc A', status: 'active', progression: 'A started' },
            { id: null, title: 'Arc B', status: 'stalled', progression: 'B stalled' },
        ]);
        expect(result.created).toBe(2);
        expect(getAllArcs()).toHaveLength(2);
    });

    it('updates an existing arc by ID', () => {
        processArcUpdates([
            { id: null, title: 'The Quest', status: 'active', progression: 'Started' },
        ]);
        const arcId = getAllArcs()[0].id;

        const result = processArcUpdates([
            { id: arcId, title: 'The Quest', status: 'active', progression: 'Reached the mountain' },
        ]);
        expect(result.updated).toBe(1);
        expect(result.created).toBe(0);

        const arcs = getAllArcs();
        expect(arcs).toHaveLength(1);
        expect(arcs[0].progression).toBe('Reached the mountain');
        expect(arcs[0].history).toHaveLength(1);
        expect(arcs[0].history[0].progression).toBe('Started');
    });

    it('counts resolved arcs', () => {
        processArcUpdates([
            { id: null, title: 'Arc X', status: 'active', progression: 'In progress' },
        ]);
        const arcId = getAllArcs()[0].id;

        const result = processArcUpdates([
            { id: arcId, title: 'Arc X', status: 'resolved', progression: 'Completed' },
        ]);
        expect(result.resolved).toBe(1);
        expect(result.updated).toBe(1);
    });

    it('caps history at 10 entries', () => {
        processArcUpdates([
            { id: null, title: 'Long Arc', status: 'active', progression: 'v0' },
        ]);
        const arcId = getAllArcs()[0].id;

        for (let i = 1; i <= 12; i++) {
            processArcUpdates([
                { id: arcId, title: 'Long Arc', status: 'active', progression: `v${i}` },
            ]);
        }

        expect(getAllArcs()[0].history.length).toBeLessThanOrEqual(10);
    });

    it('skips updates with invalid status', () => {
        const result = processArcUpdates([
            { id: null, title: 'Bad', status: 'invalid_status', progression: 'x' },
        ]);
        expect(result.created).toBe(0);
        expect(getAllArcs()).toHaveLength(0);
    });

    it('skips updates missing title', () => {
        const result = processArcUpdates([
            { id: null, title: '', status: 'active', progression: 'x' },
        ]);
        expect(result.created).toBe(0);
    });

    it('skips updates missing status', () => {
        const result = processArcUpdates([
            { id: null, title: 'Arc', status: '', progression: 'x' },
        ]);
        expect(result.created).toBe(0);
    });

    it('creates a new arc if referenced id does not exist', () => {
        const result = processArcUpdates([
            { id: 'arc_nonexistent', title: 'New', status: 'active', progression: 'created' },
        ]);
        expect(result.created).toBe(1);
        expect(result.updated).toBe(0);
    });
});

// ── getActiveArcs ────────────────────────────────────────────────

describe('getActiveArcs', () => {
    it('returns empty array when no arcs exist', () => {
        expect(getActiveArcs()).toEqual([]);
    });

    it('excludes resolved and abandoned arcs', () => {
        processArcUpdates([
            { id: null, title: 'Active', status: 'active', progression: 'going' },
            { id: null, title: 'Stalled', status: 'stalled', progression: 'stuck' },
            { id: null, title: 'Done', status: 'resolved', progression: 'finished' },
            { id: null, title: 'Dropped', status: 'abandoned', progression: 'dropped' },
        ]);

        const active = getActiveArcs();
        expect(active).toHaveLength(2);
        expect(active.map(a => a.title).sort()).toEqual(['Active', 'Stalled']);
    });
});

// ── buildArcsSummary ─────────────────────────────────────────────

describe('buildArcsSummary', () => {
    it('returns empty string when no arcs exist', () => {
        expect(buildArcsSummary()).toBe('');
    });

    it('returns markdown with Narrative Arcs header', () => {
        processArcUpdates([
            { id: null, title: 'The Quest', status: 'active', progression: 'Ongoing' },
        ]);

        const summary = buildArcsSummary();
        expect(summary).toContain('## Narrative Arcs');
        expect(summary).toContain('**The Quest**');
        expect(summary).toContain('Ongoing');
    });

    it('includes status tag for non-active arcs', () => {
        processArcUpdates([
            { id: null, title: 'Stalled Arc', status: 'stalled', progression: 'Stuck' },
        ]);

        const summary = buildArcsSummary();
        expect(summary).toContain('[stalled]');
    });

    it('omits status tag for active arcs', () => {
        processArcUpdates([
            { id: null, title: 'Active Arc', status: 'active', progression: 'Going' },
        ]);

        const summary = buildArcsSummary();
        expect(summary).not.toContain('[active]');
    });
});

// ── buildArcsContextBlock ────────────────────────────────────────

describe('buildArcsContextBlock', () => {
    it('returns empty string when no arcs exist', () => {
        expect(buildArcsContextBlock()).toBe('');
    });

    it('includes arc IDs and details', () => {
        processArcUpdates([
            { id: null, title: 'The Quest', status: 'active', progression: 'Started' },
        ]);
        const arcId = getAllArcs()[0].id;

        const block = buildArcsContextBlock();
        expect(block).toContain('[Current Known Arcs]');
        expect(block).toContain(arcId);
        expect(block).toContain('"The Quest"');
        expect(block).toContain('(active)');
    });
});

// ── Arc pruning from prompt injection ────────────────────────────

describe('resolvedAtMsgIdx tracking', () => {
    it('sets resolvedAtMsgIdx when an arc is resolved', () => {
        mockChat.length = 42;
        processArcUpdates([
            { id: null, title: 'Quest', status: 'active', progression: 'going' },
        ]);
        const arcId = getAllArcs()[0].id;

        mockChat.length = 50;
        processArcUpdates([
            { id: arcId, title: 'Quest', status: 'resolved', progression: 'done' },
        ]);

        expect(getAllArcs()[0].resolvedAtMsgIdx).toBe(50);
    });

    it('sets resolvedAtMsgIdx when an arc is abandoned', () => {
        mockChat.length = 30;
        processArcUpdates([
            { id: null, title: 'Side Plot', status: 'active', progression: 'started' },
        ]);
        const arcId = getAllArcs()[0].id;

        mockChat.length = 40;
        processArcUpdates([
            { id: arcId, title: 'Side Plot', status: 'abandoned', progression: 'dropped' },
        ]);

        expect(getAllArcs()[0].resolvedAtMsgIdx).toBe(40);
    });

    it('does not set resolvedAtMsgIdx for active or stalled updates', () => {
        mockChat.length = 10;
        processArcUpdates([
            { id: null, title: 'Arc', status: 'active', progression: 'v1' },
        ]);
        expect(getAllArcs()[0].resolvedAtMsgIdx).toBeUndefined();

        const arcId = getAllArcs()[0].id;
        processArcUpdates([
            { id: arcId, title: 'Arc', status: 'stalled', progression: 'v2' },
        ]);
        expect(getAllArcs()[0].resolvedAtMsgIdx).toBeUndefined();
    });

    it('sets resolvedAtMsgIdx on newly-created resolved arcs', () => {
        mockChat.length = 77;
        processArcUpdates([
            { id: null, title: 'Flash', status: 'resolved', progression: 'instant resolution' },
        ]);
        expect(getAllArcs()[0].resolvedAtMsgIdx).toBe(77);
    });
});

describe('prompt injection pruning', () => {
    it('excludes resolved arcs older than 5 turns from buildArcsSummary', () => {
        mockChat.length = 10;
        processArcUpdates([
            { id: null, title: 'Old Arc', status: 'active', progression: 'going' },
        ]);
        const arcId = getAllArcs()[0].id;
        processArcUpdates([
            { id: arcId, title: 'Old Arc', status: 'resolved', progression: 'done' },
        ]);

        // 6 turns later — should be excluded
        mockChat.length = 16;
        expect(buildArcsSummary()).toBe('');
    });

    it('includes resolved arcs within 5 turns in buildArcsSummary', () => {
        mockChat.length = 10;
        processArcUpdates([
            { id: null, title: 'Recent Arc', status: 'active', progression: 'going' },
        ]);
        const arcId = getAllArcs()[0].id;
        processArcUpdates([
            { id: arcId, title: 'Recent Arc', status: 'resolved', progression: 'done' },
        ]);

        // 5 turns later — should still be included
        mockChat.length = 15;
        const summary = buildArcsSummary();
        expect(summary).toContain('Recent Arc');
        expect(summary).toContain('[resolved]');
    });

    it('excludes old abandoned arcs from buildArcsContextBlock', () => {
        mockChat.length = 20;
        processArcUpdates([
            { id: null, title: 'Dropped Plot', status: 'abandoned', progression: 'nope' },
        ]);

        mockChat.length = 30;
        expect(buildArcsContextBlock()).toBe('');
    });

    it('always includes active and stalled arcs regardless of age', () => {
        mockChat.length = 5;
        processArcUpdates([
            { id: null, title: 'Active', status: 'active', progression: 'going' },
            { id: null, title: 'Stalled', status: 'stalled', progression: 'stuck' },
        ]);

        mockChat.length = 500;
        const summary = buildArcsSummary();
        expect(summary).toContain('Active');
        expect(summary).toContain('Stalled');
    });

    it('getAllArcs still returns pruned arcs (for arcs panel)', () => {
        mockChat.length = 10;
        processArcUpdates([
            { id: null, title: 'Old', status: 'resolved', progression: 'done' },
            { id: null, title: 'Current', status: 'active', progression: 'going' },
        ]);

        mockChat.length = 100;
        expect(getAllArcs()).toHaveLength(2);
        expect(buildArcsSummary()).not.toContain('Old');
        expect(buildArcsSummary()).toContain('Current');
    });
});
