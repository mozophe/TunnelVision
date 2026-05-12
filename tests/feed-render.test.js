/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../feed-state.js', () => ({
    getPanelBody: vi.fn(() => null),
    getPanelEl: vi.fn(() => null),
    getShowingArcs: vi.fn(() => false),
    getShowingTimeline: vi.fn(() => false),
    getShowingWorldState: vi.fn(() => false),
    getFeedItemsRaw: vi.fn(() => []),
    MAX_RENDERED_RETRIEVED_ENTRIES: 5,
    setLorebookStatsCache: vi.fn(),
}));

vi.mock('../feed-helpers.js', () => ({
    formatTime: vi.fn(() => '10:15'),
    formatEntrySummary: vi.fn(() => 'summary'),
    formatRetrievedEntryLabel: vi.fn(entry => entry.title || `UID ${entry.uid ?? '?'}`),
    shouldIncludeLorebookForEntries: vi.fn(() => false),
    buildVersionHistoryPanel: vi.fn(() => document.createElement('div')),
}));

vi.mock('../background-events.js', () => ({
    getActiveTasks: vi.fn(() => new Map()),
    getFailedTasks: vi.fn(() => new Map()),
    cancelBackgroundTask: vi.fn(),
    retryFailedTask: vi.fn(),
    dismissFailedTask: vi.fn(),
    addBackgroundEvent: vi.fn(),
}));

vi.mock('../entry-manager.js', () => ({
    findEntry: vi.fn(),
    getEntryVersions: vi.fn(() => []),
}));

vi.mock('../ui-controller.js', () => ({
    openTreeEditorForBook: vi.fn(),
}));

vi.mock('../post-turn-processor.js', () => ({
    createTrackerForCharacter: vi.fn(),
}));

vi.mock('../feed-ui/feed-panel.js', () => ({
    getActiveTab: vi.fn(() => 'all'),
}));

import { buildItemElement, toggleBackgroundExpand } from '../feed-ui/feed-render.js';

describe('feed rendering', () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    it('adds a distinct class and icon for post-turn triggered entries', () => {
        const item = {
            type: 'entry',
            source: 'post-turn',
            icon: 'fa-book-open',
            verb: 'Triggered',
            color: '#e84393',
            lorebook: 'test-book',
            uid: 17,
            title: 'Elena learned the code phrase',
            keys: ['elena', 'code phrase'],
            timestamp: Date.now(),
        };

        const row = buildItemElement(item);
        document.body.appendChild(row);

        expect(row.classList.contains('tv-feed-clickable')).toBe(true);
        expect(row.classList.contains('tv-float-item-entry-native')).toBe(true);
        expect(row.classList.contains('tv-float-item-entry-post-turn')).toBe(true);
        expect(row.textContent).toContain('summary');
        const sourceIcon = row.querySelector('.tv-float-source-icon-post-turn');
        expect(sourceIcon).not.toBeNull();
        expect(sourceIcon.getAttribute('title')).toBe('Post-turn');
    });

    it('adds a distinct class and icon for world-state triggered entries', () => {
        const item = {
            type: 'entry',
            source: 'world-state',
            icon: 'fa-book-open',
            verb: 'Triggered',
            color: '#e84393',
            lorebook: 'test-book',
            uid: 21,
            title: 'World state fact',
            keys: ['world'],
            timestamp: Date.now(),
        };

        const row = buildItemElement(item);
        document.body.appendChild(row);

        expect(row.classList.contains('tv-feed-clickable')).toBe(true);
        expect(row.classList.contains('tv-float-item-entry-native')).toBe(true);
        expect(row.classList.contains('tv-float-item-entry-world-state')).toBe(true);
        const sourceIcon = row.querySelector('.tv-float-source-icon-world-state');
        expect(sourceIcon).not.toBeNull();
        expect(sourceIcon.getAttribute('title')).toBe('World State');
    });

    it('renders background action controls when background items expand', () => {
        const row = document.createElement('div');
        document.body.appendChild(row);

        toggleBackgroundExpand(row, {
            type: 'background',
            action: { type: 'open-tree-editor', label: 'Open tree', icon: 'fa-folder-tree' },
        });

        const expand = row.nextElementSibling;
        expect(expand.querySelector('.tv-feed-expand-actions')).not.toBeNull();
        expect(expand.textContent).toContain('Open tree');
    });

    it('renders related prewarm entries when background items expand', () => {
        const item = {
            type: 'background',
            icon: 'fa-forward',
            verb: 'Pre-warmed',
            color: '#fdcb6e',
            summary: '8 smart-context entries cached for the next prompt',
            preWarmSource: 'smart-context',
            relatedEntries: [
                { title: 'Elena Blackwood', lorebook: 'Book A', uid: 17, score: 14.2, tier: 'hot', keys: ['elena', 'blackwood'] },
            ],
            timestamp: Date.now(),
        };

        const row = buildItemElement(item);
        document.body.appendChild(row);

        expect(row.classList.contains('tv-feed-clickable')).toBe(true);
    expect(row.classList.contains('tv-float-item-prewarm-smart-context')).toBe(true);

        toggleBackgroundExpand(row, item);

        const expand = row.nextElementSibling;
        expect(expand).not.toBeNull();
        expect(expand.textContent).toContain('Elena Blackwood');
        expect(expand.textContent).toContain('Book A');
        expect(expand.textContent).toContain('UID 17');
        expect(expand.textContent).toContain('score 14.2');
    });

    it('adds a distinct class for fact-driven prewarm rows', () => {
        const row = buildItemElement({
            type: 'background',
            icon: 'fa-brain',
            verb: 'Pre-warmed',
            color: '#e84393',
            summary: '2 smart-context entries cached for the next prompt',
            preWarmSource: 'fact-driven',
            relatedEntries: [{ title: 'Elena', lorebook: 'Book A', uid: 1 }],
            timestamp: Date.now(),
        });

        expect(row.classList.contains('tv-float-item-prewarm-fact')).toBe(true);
    });

    it('styles grouped injected smart-context rows with the prewarm class family', () => {
        const row = buildItemElement({
            type: 'background',
            icon: 'fa-wand-magic-sparkles',
            verb: 'Injected',
            color: '#fdcb6e',
            summary: '20 entries injected into the prompt',
            preWarmSource: 'smart-context',
            relatedEntries: [{ title: 'Elena', lorebook: 'Book A', uid: 1 }],
            timestamp: Date.now(),
        });

        expect(row.classList.contains('tv-float-item-prewarm-smart-context')).toBe(true);
    });
});