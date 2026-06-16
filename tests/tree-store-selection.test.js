import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extension_settings } from '../../../extensions.js';

// Local st-context mock exposing chatMetadata + saveMetadataDebounced.
// Overrides the shared tests/__mocks__/st-context.js, which omits both.
// `mockChatMetadata` is a `let` so a test can swap it to null ("no active chat").
let mockChatMetadata = {};
const mockSaveMetadataDebounced = vi.fn();
vi.mock('../../../st-context.js', () => ({
    getContext: () => ({
        chatMetadata: mockChatMetadata,
        saveMetadataDebounced: mockSaveMetadataDebounced,
    }),
}));

import {
    getSelectedLorebook,
    setSelectedLorebook,
} from '../tree-store.js';

const SELECTED_BOOK_KEY = 'tunnelvision_selected_book';

beforeEach(() => {
    mockChatMetadata = {};
    mockSaveMetadataDebounced.mockClear();
    extension_settings.tunnelvision = {};
});

describe('getSelectedLorebook / setSelectedLorebook (chat-scoped)', () => {
    it('writes selection into chat metadata and saves', () => {
        setSelectedLorebook('Book A');
        expect(mockChatMetadata[SELECTED_BOOK_KEY]).toBe('Book A');
        expect(mockSaveMetadataDebounced).toHaveBeenCalledTimes(1);
    });

    it('reads selection back from chat metadata', () => {
        mockChatMetadata[SELECTED_BOOK_KEY] = 'Book B';
        expect(getSelectedLorebook()).toBe('Book B');
    });

    it('returns null when nothing is selected', () => {
        expect(getSelectedLorebook()).toBeNull();
    });

    it('clears the key when selection is falsy', () => {
        mockChatMetadata[SELECTED_BOOK_KEY] = 'Book A';
        setSelectedLorebook(null);
        expect(SELECTED_BOOK_KEY in mockChatMetadata).toBe(false);
        expect(mockSaveMetadataDebounced).toHaveBeenCalledTimes(1);
    });

    it('returns null when there is no active chat', () => {
        mockChatMetadata = null;
        expect(getSelectedLorebook()).toBeNull();
    });

    it('set is a no-op (no throw, no save) without an active chat', () => {
        mockChatMetadata = null;
        expect(() => setSelectedLorebook('Book A')).not.toThrow();
        expect(mockSaveMetadataDebounced).not.toHaveBeenCalled();
    });
});
