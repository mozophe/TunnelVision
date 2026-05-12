import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = {
    context: {
        chatMetadata: {},
        chat: [],
        saveMetadataDebounced: vi.fn(),
    },
};

vi.mock('../../../st-context.js', () => ({
    getContext: vi.fn(() => mockState.context),
}));

vi.mock('../../../../script.js', () => ({
    eventSource: { on: vi.fn() },
    event_types: {},
    generateQuietPrompt: vi.fn(),
}));

vi.mock('../constants.js', () => ({
    MAX_EXCERPT_CHARS: 3000,
}));

vi.mock('../tree-store.js', () => ({
    getSettings: vi.fn(() => ({ worldStateEnabled: true, globalEnabled: true })),
    isSummaryTitle: vi.fn(() => false),
    isTrackerTitle: vi.fn(() => false),
}));

vi.mock('../tool-registry.js', () => ({
    getActiveTunnelVisionBooks: vi.fn(() => []),
}));

vi.mock('../entry-manager.js', () => ({
    getCachedWorldInfo: vi.fn(async () => null),
}));

vi.mock('../agent-utils.js', () => ({
    getChatId: vi.fn(() => 'test-chat'),
    formatChatExcerpt: vi.fn(() => ''),
    callWithRetry: vi.fn(),
}));

vi.mock('../background-events.js', () => ({
    addBackgroundEvent: vi.fn(),
    registerBackgroundTask: vi.fn(() => ({ cancelled: false, _ended: false, end: vi.fn(), fail: vi.fn() })),
}));

vi.mock('../arc-tracker.js', () => ({
    buildArcsSummary: vi.fn(() => ''),
}));

vi.mock('../world-info-attribution.js', () => ({
    withWorldInfoAttribution: vi.fn(async (_source, operation) => await operation()),
}));

import { getWorldStateTemporalSnapshot } from '../world-state.js';

describe('getWorldStateTemporalSnapshot', () => {
    beforeEach(() => {
        mockState.context = {
            chatMetadata: {},
            chat: [],
            saveMetadataDebounced: vi.fn(),
        };
    });

    it('extracts normalized day/date/time/location from Current Scene sections', () => {
        mockState.context.chatMetadata.tunnelvision_worldstate = {
            sections: {
                'Current Scene': [
                    '## Current Scene',
                    'Day: 6',
                    'Date: Sunday 16 March 2025',
                    'Time: around 13:10-13:20',
                    'Location: Germany > Berlin > Cafe',
                ].join('\n'),
            },
        };

        expect(getWorldStateTemporalSnapshot()).toEqual({
            day: 'Day 6',
            date: 'Sunday 16 March 2025',
            time: 'around 13:10-13:20',
            location: 'Germany > Berlin > Cafe',
        });
    });

    it('returns null when no temporal fields are available', () => {
        mockState.context.chatMetadata.tunnelvision_worldstate = {
            sections: {
                'Current Scene': '## Current Scene\nPresent: Elena\nSituation: Talking.',
            },
        };

        expect(getWorldStateTemporalSnapshot()).toBeNull();
    });
});