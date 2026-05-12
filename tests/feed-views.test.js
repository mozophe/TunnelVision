/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * This test file validates:
 * - Timeline prefers temporal metadata ("when") over content timestamp for grouping/sorting.
 * - Timeline falls back to parsing content timestamp when temporal is missing/undated.
 * - Timeline enrichment button prepends missing [when] timestamps and persists only when changes occur.
 *
 * Note: vi.mock factories are hoisted, so avoid referencing top-level variables inside them.
 * Instead, define vi.fn() inside the factory and import the mocked exports for control/assertions.
 */

vi.mock('../tool-registry.js', () => ({
    getActiveTunnelVisionBooks: vi.fn(),
}));

vi.mock('../tree-store.js', () => ({
    isSummaryTitle: vi.fn(),
    isTrackerTitle: vi.fn(),
}));

vi.mock('../entry-manager.js', () => ({
    getCachedWorldInfo: vi.fn(),
    getEntryTemporal: vi.fn(),
    persistWorldInfo: vi.fn(),
}));

vi.mock('../world-state.js', () => ({
    getWorldStateText: vi.fn(() => ''),
    updateWorldState: vi.fn(),
    clearWorldState: vi.fn(),
    isWorldStateUpdating: vi.fn(() => false),
    hasPreviousWorldState: vi.fn(() => false),
    revertWorldState: vi.fn(),
}));

vi.mock('../arc-tracker.js', () => ({
    getAllArcs: vi.fn(() => []),
}));

vi.mock('../entry-scoring.js', () => ({
    countStaleEntries: vi.fn(() => 0),
    buildHealthReport: vi.fn(() => ({
        totalEntries: 0,
        facts: 0,
        summaries: 0,
        trackers: 0,
        disabled: 0,
        categoryDistribution: [],
        staleEntries: [],
    })),
}));

vi.mock('../../../st-context.js', () => ({
    getContext: vi.fn(() => ({ chatMetadata: {}, saveMetadataDebounced: vi.fn(), chat: [] })),
}));

vi.mock('../shared-utils.js', () => ({
    formatShortDateTime: vi.fn(() => 'formatted'),
}));

import { setPanelBody } from '../feed-state.js';
import { loadTimelineEntries, renderTimelineView } from '../feed-views.js';

import { getActiveTunnelVisionBooks } from '../tool-registry.js';
import { isSummaryTitle, isTrackerTitle } from '../tree-store.js';
import { getCachedWorldInfo, getEntryTemporal, persistWorldInfo } from '../entry-manager.js';

function findButtonByTextContains(substr) {
    return Array.from(document.querySelectorAll('button'))
        .find((btn) => (btn.textContent || '').includes(substr));
}

async function flushMicrotasks(times = 3) {
    for (let i = 0; i < times; i++) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
    }
}

describe('feed-views timeline temporal integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Basic DOM panel body for renderTimelineView()
        document.body.innerHTML = '';
        const panelBody = document.createElement('div');
        document.body.appendChild(panelBody);
        setPanelBody(panelBody);

        // Default mock behavior
        getActiveTunnelVisionBooks.mockReturnValue(['BookA']);
        isSummaryTitle.mockImplementation((title) => /^\[Summary\]/i.test(title || ''));
        isTrackerTitle.mockReturnValue(false);

        getCachedWorldInfo.mockResolvedValue({ entries: {} });
        getEntryTemporal.mockReturnValue(null);
        persistWorldInfo.mockResolvedValue(undefined);
    });

    describe('loadTimelineEntries()', () => {
        it('prefers temporal metadata over content timestamp for grouping/label/timeLabel', async () => {
            getCachedWorldInfo.mockResolvedValue({
                entries: {
                    a: {
                        uid: 101,
                        comment: 'Market arrival',
                        content: '[Day 2] They arrived at the market.',
                        disable: false,
                    },
                },
            });

            getEntryTemporal.mockImplementation((book, uid) => {
                if (book === 'BookA' && uid === 101) {
                    return {
                        when: 'Day 6, Sunday 16 March 2025, around 13:10-13:20',
                        turnIndex: 12,
                        arcId: null,
                        supersedes: null,
                        createdAt: 1,
                    };
                }
                return null;
            });

            const groups = await loadTimelineEntries();

            expect(groups).toHaveLength(1);
            expect(groups[0].groupKey).toBe('date:2025-03-16');
            expect(groups[0].groupLabel).toBe('Sunday 16 March 2025 (Day 6)');
            expect(groups[0].entries).toHaveLength(1);
            expect(groups[0].entries[0].timeLabel).toBe('Day 6, Sunday 16 March 2025, around 13:10-13:20');

            // Content should come from entry.content with its own leading timestamp stripped.
            expect(groups[0].entries[0].content).toBe('They arrived at the market.');
        });

        it('falls back to fact content timestamp when temporal metadata is missing', async () => {
            getCachedWorldInfo.mockResolvedValue({
                entries: {
                    a: {
                        uid: 102,
                        comment: 'Camped overnight',
                        content: '[Day 4, evening] They camped by the ruins.',
                        disable: false,
                    },
                },
            });

            const groups = await loadTimelineEntries();

            expect(groups).toHaveLength(1);
            expect(groups[0].groupKey).toBe('day:4');
            expect(groups[0].groupLabel).toBe('Day 4');
            expect(groups[0].entries[0].timeLabel).toBe('Day 4, evening');
            expect(groups[0].entries[0].content).toBe('They camped by the ruins.');
        });

        it('falls back to fact content timestamp when temporal "when" is undated (no Day/date)', async () => {
            getCachedWorldInfo.mockResolvedValue({
                entries: {
                    a: {
                        uid: 103,
                        comment: 'Bell toll',
                        content: '[Day 3] The old bell tolled at dawn.',
                        disable: false,
                    },
                },
            });

            getEntryTemporal.mockReturnValue({
                when: 'around dawn',
                turnIndex: 9,
                arcId: null,
                supersedes: null,
                createdAt: 1,
            });

            const groups = await loadTimelineEntries();

            expect(groups).toHaveLength(1);
            expect(groups[0].groupKey).toBe('day:3');
            expect(groups[0].groupLabel).toBe('Day 3');
            expect(groups[0].entries[0].timeLabel).toBe('Day 3');
            expect(groups[0].entries[0].content).toBe('The old bell tolled at dawn.');
        });

        it('keeps richer content time labels when temporal metadata only provides the grouping anchor', async () => {
            getCachedWorldInfo.mockResolvedValue({
                entries: {
                    a: {
                        uid: 104,
                        comment: 'Late arrival',
                        content: '[Day 6, evening] They arrived after sunset.',
                        disable: false,
                    },
                },
            });

            getEntryTemporal.mockReturnValue({
                when: 'Day 6',
                turnIndex: 10,
                arcId: null,
                supersedes: null,
                createdAt: 1,
            });

            const groups = await loadTimelineEntries();

            expect(groups).toHaveLength(1);
            expect(groups[0].groupKey).toBe('day:6');
            expect(groups[0].entries[0].timeLabel).toBe('Day 6, evening');
            expect(groups[0].entries[0].content).toBe('They arrived after sunset.');
        });

        it('orders entries within the same timeline group by temporal turn index', async () => {
            getCachedWorldInfo.mockResolvedValue({
                entries: {
                    a: {
                        uid: 105,
                        comment: 'Second event',
                        content: '[Day 6] The second event happened.',
                        disable: false,
                    },
                    b: {
                        uid: 106,
                        comment: 'First event',
                        content: '[Day 6] The first event happened.',
                        disable: false,
                    },
                },
            });

            getEntryTemporal.mockImplementation((_book, uid) => {
                if (uid === 105) {
                    return { when: 'Day 6', turnIndex: 8, arcId: null, supersedes: null, createdAt: 2 };
                }
                if (uid === 106) {
                    return { when: 'Day 6', turnIndex: 4, arcId: null, supersedes: null, createdAt: 1 };
                }
                return null;
            });

            const groups = await loadTimelineEntries();

            expect(groups).toHaveLength(1);
            expect(groups[0].entries.map(entry => entry.title)).toEqual(['First event', 'Second event']);
        });
    });

    describe('timeline enrichment button', () => {
        it('prepends missing timestamp from temporal data and persists changed lorebooks', async () => {
            const bookData = {
                entries: {
                    a: {
                        uid: 201,
                        comment: 'Guild charter signed',
                        content: 'The guild charter was signed by all five founders.',
                        disable: false,
                    },
                    b: {
                        uid: 202,
                        comment: 'Already stamped',
                        content: '[Day 7] Existing timestamp should remain untouched.',
                        disable: false,
                    },
                    c: {
                        uid: 203,
                        comment: 'No temporal',
                        content: 'This one has no temporal metadata.',
                        disable: false,
                    },
                },
            };

            getCachedWorldInfo.mockResolvedValue(bookData);
            getEntryTemporal.mockImplementation((book, uid) => {
                if (book !== 'BookA') return null;
                if (uid === 201) {
                    return {
                        when: 'Day 8, Monday 17 March 2025, morning',
                        turnIndex: 20,
                        arcId: null,
                        supersedes: null,
                        createdAt: 1,
                    };
                }
                if (uid === 202) {
                    return {
                        when: 'Day 9, Tuesday 18 March 2025, noon',
                        turnIndex: 21,
                        arcId: null,
                        supersedes: null,
                        createdAt: 1,
                    };
                }
                return null;
            });

            await renderTimelineView();

            const enrichBtn = findButtonByTextContains('Enrich from Temporal');
            expect(enrichBtn).toBeTruthy();

            enrichBtn.click();
            await flushMicrotasks(5);

            expect(bookData.entries.a.content).toBe('[Day 8, Monday 17 March 2025, morning] The guild charter was signed by all five founders.');
            expect(bookData.entries.b.content).toBe('[Day 7] Existing timestamp should remain untouched.');
            expect(bookData.entries.c.content).toBe('This one has no temporal metadata.');

            expect(persistWorldInfo).toHaveBeenCalledTimes(1);
            expect(persistWorldInfo).toHaveBeenCalledWith('BookA', bookData);
        });

        it('does not persist when no entries were changed', async () => {
            const bookData = {
                entries: {
                    a: {
                        uid: 301,
                        comment: 'Already stamped',
                        content: '[Day 2] Existing timestamp',
                        disable: false,
                    },
                    b: {
                        uid: 302,
                        comment: 'Missing temporal',
                        content: 'No when available',
                        disable: false,
                    },
                },
            };

            getCachedWorldInfo.mockResolvedValue(bookData);
            getEntryTemporal.mockImplementation((book, uid) => {
                if (book !== 'BookA') return null;
                if (uid === 301) {
                    return {
                        when: 'Day 5',
                        turnIndex: 1,
                        arcId: null,
                        supersedes: null,
                        createdAt: 1,
                    };
                }
                return null;
            });

            await renderTimelineView();

            const enrichBtn = findButtonByTextContains('Enrich from Temporal');
            expect(enrichBtn).toBeTruthy();

            enrichBtn.click();
            await flushMicrotasks(5);

            expect(persistWorldInfo).not.toHaveBeenCalled();
            expect(bookData.entries.a.content).toBe('[Day 2] Existing timestamp');
            expect(bookData.entries.b.content).toBe('No when available');
        });
    });
});