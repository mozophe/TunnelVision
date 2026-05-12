/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../tool-registry.js', () => ({
    getActiveTunnelVisionBooks: vi.fn(),
}));

vi.mock('../tree-store.js', () => ({
    isSummaryTitle: vi.fn(),
    isTrackerTitle: vi.fn(),
}));

vi.mock('../entry-manager.js', () => ({
    getCachedWorldInfo: vi.fn(),
}));

vi.mock('../entry-scoring.js', () => ({
    countStaleEntries: vi.fn(),
}));

vi.mock('../agent-utils.js', () => ({
    getInjectionSizes: vi.fn(),
    getMaxContextTokens: vi.fn(),
}));

import { getActiveTunnelVisionBooks } from '../tool-registry.js';
import { isSummaryTitle, isTrackerTitle } from '../tree-store.js';
import { getCachedWorldInfo } from '../entry-manager.js';
import { countStaleEntries } from '../entry-scoring.js';
import { getInjectionSizes, getMaxContextTokens } from '../agent-utils.js';

import {
    getFeedItemsRaw,
    setFeedItems,
    getLorebookStatsCache,
    setLorebookStatsCache,
    getLorebookStatsCacheTime,
    setLorebookStatsCacheTime,
    LOREBOOK_STATS_CACHE_TTL,
} from '../feed-state.js';

import {
    renderStatsBar,
    computeLorebookStats,
    buildContextUsageBar,
    addStatPair,
} from '../feed-ui/feed-stats.js';

describe('feed-stats', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setFeedItems([]);
        setLorebookStatsCache(null);
        setLorebookStatsCacheTime(0);

        getActiveTunnelVisionBooks.mockReturnValue([]);
        getCachedWorldInfo.mockResolvedValue(null);
        countStaleEntries.mockReturnValue(0);
        isSummaryTitle.mockImplementation((title) => title.startsWith('[Summary]'));
        isTrackerTitle.mockImplementation((title) => title.startsWith('[Tracker]'));
        getInjectionSizes.mockReturnValue({
            mandatory: 0,
            worldState: 0,
            smartContext: 0,
            notebook: 0,
            total: 0,
        });
        getMaxContextTokens.mockReturnValue(0);
    });

    describe('addStatPair', () => {
        it('appends a stat element with icon, value, and tooltip', () => {
            const container = document.createElement('div');

            addStatPair(container, 'fa-gear', 12, 'Tool calls', '#f0946c');

            expect(container.children).toHaveLength(1);
            const stat = container.firstElementChild;
            expect(stat.className).toBe('tv-feed-stat');
            expect(stat.title).toBe('Tool calls');
            expect(stat.querySelector('i')?.className).toContain('fa-gear');
            expect(stat.querySelector('.tv-feed-stat-value')?.textContent).toBe('12');
        });
    });

    describe('buildContextUsageBar', () => {
        it('returns null when total injection size is zero', () => {
            getInjectionSizes.mockReturnValue({
                mandatory: 0,
                worldState: 0,
                smartContext: 0,
                notebook: 0,
                total: 0,
            });

            expect(buildContextUsageBar()).toBeNull();
        });

        it('renders usage label, segments, legend, and tooltip with max context', () => {
            getInjectionSizes.mockReturnValue({
                mandatory: 400,
                worldState: 200,
                smartContext: 300,
                notebook: 100,
                total: 1000,
            });
            getMaxContextTokens.mockReturnValue(500);

            const bar = buildContextUsageBar();

            expect(bar).not.toBeNull();
            expect(bar.className).toBe('tv-context-usage');

            const label = bar.querySelector('.tv-context-usage-text');
            expect(label).not.toBeNull();
            expect(label.textContent).toContain('TV: ~250 tok');
            expect(label.textContent).toContain('/ 500');
            expect(label.textContent).toContain('(50.0%)');

            const segments = bar.querySelectorAll('.tv-budget-seg');
            expect(segments.length).toBe(5);

            const legendItems = Array.from(bar.querySelectorAll('.tv-budget-legend-item')).map(el => el.textContent);
            expect(legendItems).toEqual([
                'Prompt 100',
                'World State 50',
                'Smart Context 75',
                'Notebook 25',
            ]);

            expect(bar.title).toContain('TunnelVision injection: 1000 chars (~250 tokens)');
            expect(bar.title).toContain('Prompt: 400');
            expect(bar.title).toContain('WS: 200');
            expect(bar.title).toContain('SC: 300');
            expect(bar.title).toContain('NB: 100');
        });

        it('renders without headroom segment when total meets or exceeds max context', () => {
            getInjectionSizes.mockReturnValue({
                mandatory: 800,
                worldState: 400,
                smartContext: 400,
                notebook: 400,
                total: 2000,
            });
            getMaxContextTokens.mockReturnValue(500); // max chars = 2000

            const bar = buildContextUsageBar();

            const headroom = bar.querySelector('.tv-budget-seg-headroom');
            expect(headroom).toBeNull();

            const segments = bar.querySelectorAll('.tv-budget-seg');
            expect(segments.length).toBe(4);
        });

        it('renders with no max context percentage when max tokens is unavailable', () => {
            getInjectionSizes.mockReturnValue({
                mandatory: 120,
                worldState: 80,
                smartContext: 0,
                notebook: 0,
                total: 200,
            });
            getMaxContextTokens.mockReturnValue(0);

            const bar = buildContextUsageBar();
            const label = bar.querySelector('.tv-context-usage-text');

            expect(label.textContent).toBe('TV: ~50 tok');
            expect(bar.querySelectorAll('.tv-budget-seg')).toHaveLength(2);
            expect(bar.querySelector('.tv-budget-seg-headroom')).toBeNull();
        });
    });

    describe('computeLorebookStats', () => {
        it('counts facts, summaries, trackers, and stale entries across active books', async () => {
            getActiveTunnelVisionBooks.mockReturnValue(['BookA', 'BookB']);

            getCachedWorldInfo.mockImplementation(async (bookName) => {
                if (bookName === 'BookA') {
                    return {
                        entries: {
                            a: { comment: 'Fact A', disable: false },
                            b: { comment: '[Summary] Chapter 1', disable: false },
                            c: { comment: '[Tracker] Elena', disable: false },
                            d: { comment: 'Disabled Fact', disable: true },
                        },
                    };
                }

                return {
                    entries: {
                        e: { comment: 'Fact B', disable: false },
                        f: { comment: '[Summary] Chapter 2', disable: false },
                    },
                };
            });

            countStaleEntries.mockImplementation((bookData) => {
                const keys = Object.keys(bookData.entries);
                return keys.includes('a') ? 2 : 1;
            });

            const result = await computeLorebookStats();

            expect(result).toEqual({
                facts: 2,
                summaries: 2,
                trackers: 1,
                stale: 3,
            });

            expect(getCachedWorldInfo).toHaveBeenCalledTimes(2);
            expect(getCachedWorldInfo).toHaveBeenCalledWith('BookA');
            expect(getCachedWorldInfo).toHaveBeenCalledWith('BookB');
            expect(getLorebookStatsCache()).toEqual(result);
            expect(getLorebookStatsCacheTime()).toBeGreaterThan(0);
        });

        it('uses cached result when cache is still fresh', async () => {
            const cached = { facts: 9, summaries: 8, trackers: 7, stale: 6 };
            setLorebookStatsCache(cached);
            setLorebookStatsCacheTime(Date.now());

            const result = await computeLorebookStats();

            expect(result).toBe(cached);
            expect(getCachedWorldInfo).not.toHaveBeenCalled();
        });

        it('recomputes after cache expires', async () => {
            setLorebookStatsCache({ facts: 1, summaries: 1, trackers: 1, stale: 1 });
            setLorebookStatsCacheTime(Date.now() - (LOREBOOK_STATS_CACHE_TTL + 1000));

            getActiveTunnelVisionBooks.mockReturnValue(['BookA']);
            getCachedWorldInfo.mockResolvedValue({
                entries: {
                    a: { comment: 'Fresh Fact', disable: false },
                },
            });

            const result = await computeLorebookStats();

            expect(result).toEqual({
                facts: 1,
                summaries: 0,
                trackers: 0,
                stale: 0,
            });
            expect(getCachedWorldInfo).toHaveBeenCalledTimes(1);
        });

        it('skips unavailable books and books with missing entries', async () => {
            getActiveTunnelVisionBooks.mockReturnValue(['BadBook', 'EmptyBook', 'GoodBook']);

            getCachedWorldInfo.mockImplementation(async (bookName) => {
                if (bookName === 'BadBook') {
                    throw new Error('Unavailable');
                }
                if (bookName === 'EmptyBook') {
                    return {};
                }
                return {
                    entries: {
                        a: { comment: 'Known Fact', disable: false },
                    },
                };
            });

            const result = await computeLorebookStats();

            expect(result).toEqual({
                facts: 1,
                summaries: 0,
                trackers: 0,
                stale: 0,
            });
        });
    });

    describe('renderStatsBar', () => {
        it('renders counts for entries, tool calls, and background items', async () => {
            setFeedItems([
                { type: 'entry', source: 'native' },
                { type: 'entry', source: 'post-turn' },
                { type: 'entry', source: 'world-state' },
                { type: 'entry', source: 'tunnelvision' },
                { type: 'tool' },
                { type: 'tool' },
                { type: 'background' },
            ]);

            getActiveTunnelVisionBooks.mockReturnValue([]);
            const bar = renderStatsBar();

            expect(bar.className).toBe('tv-feed-stats');

            const stats = Array.from(bar.querySelectorAll('.tv-feed-stat'));
            expect(stats[0].title).toBe('Entries (1 native, 1 post-turn, 1 world-state, 1 TV)');
            expect(stats[0].querySelector('.tv-feed-stat-value')?.textContent).toBe('4');

            expect(stats[1].title).toBe('Tool calls');
            expect(stats[1].querySelector('.tv-feed-stat-value')?.textContent).toBe('2');

            expect(stats[2].title).toBe('Agent tasks');
            expect(stats[2].querySelector('.tv-feed-stat-value')?.textContent).toBe('1');

            await Promise.resolve();

            const dbStat = Array.from(bar.querySelectorAll('.tv-feed-stat'))
                .find(el => el.title.includes('Lorebook:') || el.title === 'Lorebook stats unavailable');
            expect(dbStat).toBeTruthy();
        });

        it('renders lorebook total and stale indicator after async stats resolve', async () => {
            setFeedItems([{ type: 'entry', source: 'native' }]);
            getActiveTunnelVisionBooks.mockReturnValue(['BookA']);
            getCachedWorldInfo.mockResolvedValue({
                entries: {
                    a: { comment: 'Fact', disable: false },
                    b: { comment: '[Summary] S', disable: false },
                    c: { comment: '[Tracker] T', disable: false },
                },
            });
            countStaleEntries.mockReturnValue(2);

            const bar = renderStatsBar();

            await Promise.resolve();
            await Promise.resolve();

            const stats = Array.from(bar.querySelectorAll('.tv-feed-stat'));
            const lorebookStat = stats.find(el => el.title.startsWith('Lorebook:'));
            expect(lorebookStat).toBeTruthy();
            expect(lorebookStat.querySelector('.tv-feed-stat-value')?.textContent).toBe('3');
            expect(lorebookStat.title).toContain('1 facts, 1 summaries, 1 trackers, 2 stale');

            const staleStat = stats.find(el => el.title.includes('never referenced by the AI'));
            expect(staleStat).toBeTruthy();
            expect(staleStat.querySelector('.tv-feed-stat-value')?.textContent).toBe('2');
        });

        it('rejects computeLorebookStats when lorebook loading fails', async () => {
            // Ensure we don't short-circuit via cache from earlier tests.
            setLorebookStatsCache(null);
            setLorebookStatsCacheTime(Date.now() - (LOREBOOK_STATS_CACHE_TTL + 1000));

            getActiveTunnelVisionBooks.mockReturnValue(['BookA']);
            getCachedWorldInfo.mockRejectedValue(new Error('boom'));

            await expect(computeLorebookStats()).rejects.toThrow('Lorebook stats unavailable');
        });

        it('includes context usage bar when injection sizes are non-zero', () => {
            setFeedItems([{ type: 'entry', source: 'native' }]);
            getInjectionSizes.mockReturnValue({
                mandatory: 100,
                worldState: 50,
                smartContext: 25,
                notebook: 25,
                total: 200,
            });
            getMaxContextTokens.mockReturnValue(100);

            const bar = renderStatsBar();

            expect(bar.querySelector('.tv-context-usage')).not.toBeNull();
        });

        it('omits context usage bar when injection sizes are zero', () => {
            setFeedItems([{ type: 'entry', source: 'native' }]);
            getInjectionSizes.mockReturnValue({
                mandatory: 0,
                worldState: 0,
                smartContext: 0,
                notebook: 0,
                total: 0,
            });

            const bar = renderStatsBar();

            expect(bar.querySelector('.tv-context-usage')).toBeNull();
        });
    });
});