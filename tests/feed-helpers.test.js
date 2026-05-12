import { describe, expect, it } from 'vitest';

import { createEntryFeedItem, formatEntrySummary } from '../feed-helpers.js';

describe('entry feed item helpers', () => {
    it('keeps post-turn world info activations in the Triggered family', () => {
        const item = createEntryFeedItem({
            source: 'post-turn',
            lorebook: 'test-book',
            uid: 9,
            title: 'Fact title',
            keys: ['fact'],
            timestamp: 123,
        });

        expect(item).toMatchObject({
            type: 'entry',
            source: 'post-turn',
            verb: 'Triggered',
            color: '#e84393',
            lorebook: 'test-book',
            uid: 9,
            title: 'Fact title',
        });
    });

    it('keeps world-state activations in the Triggered family', () => {
        const item = createEntryFeedItem({
            source: 'world-state',
            lorebook: 'test-book',
            uid: 10,
            title: 'World state fact',
            keys: ['world'],
            timestamp: 123,
        });

        expect(item).toMatchObject({
            type: 'entry',
            source: 'world-state',
            verb: 'Triggered',
            color: '#e84393',
            lorebook: 'test-book',
            uid: 10,
            title: 'World state fact',
        });
    });

    it('keeps entry summaries clean for post-turn items', () => {
        const summary = formatEntrySummary({
            source: 'post-turn',
            title: 'Fact title',
            uid: 9,
            lorebook: 'test-book',
        }, true);

        expect(summary).toBe('test-book: Fact title (#9)');
    });
});