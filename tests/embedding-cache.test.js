import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockEmbeddingSupported = false;
let mockComputeEmbeddings = vi.fn(async () => []);

vi.mock('../llm-sidecar.js', () => ({
    isEmbeddingSupported: () => mockEmbeddingSupported,
    computeEmbeddings: (...args) => mockComputeEmbeddings(...args),
}));

import {
    isEmbeddingAvailable,
    clearEmbeddingCache,
    getEmbeddingSimilarityBoosts,
} from '../embedding-cache.js';

beforeEach(() => {
    mockEmbeddingSupported = false;
    mockComputeEmbeddings = vi.fn(async () => []);
    clearEmbeddingCache();
});

// ── isEmbeddingAvailable ─────────────────────────────────────────

describe('isEmbeddingAvailable', () => {
    it('returns false when sidecar does not support embeddings', () => {
        expect(isEmbeddingAvailable()).toBe(false);
    });

    it('returns true when sidecar supports embeddings', () => {
        mockEmbeddingSupported = true;
        expect(isEmbeddingAvailable()).toBe(true);
    });
});

// ── clearEmbeddingCache ──────────────────────────────────────────

describe('clearEmbeddingCache', () => {
    it('does not throw', () => {
        expect(() => clearEmbeddingCache()).not.toThrow();
    });

    it('can be called multiple times', () => {
        clearEmbeddingCache();
        clearEmbeddingCache();
        clearEmbeddingCache();
    });
});

// ── getEmbeddingSimilarityBoosts ─────────────────────────────────

describe('getEmbeddingSimilarityBoosts', () => {
    const makeCandidate = (uid, content, bookName = 'testBook') => ({
        entry: { uid, comment: `Entry ${uid}`, content, key: [] },
        bookName,
        score: 10,
    });

    it('returns empty map for empty candidates', async () => {
        const boosts = await getEmbeddingSimilarityBoosts([], 'some text');
        expect(boosts.size).toBe(0);
    });

    it('returns empty map when recentText is empty', async () => {
        const boosts = await getEmbeddingSimilarityBoosts([makeCandidate(1, 'content')], '');
        expect(boosts.size).toBe(0);
    });

    it('returns empty map when recentText is falsy', async () => {
        const boosts = await getEmbeddingSimilarityBoosts([makeCandidate(1, 'content')], null);
        expect(boosts.size).toBe(0);
    });

    it('computes boosts using embeddings from sidecar', async () => {
        // Embedding for entry: [1, 0, 0], embedding for chat: [1, 0, 0] → cosine = 1.0 → boost 8
        mockComputeEmbeddings = vi.fn()
            .mockResolvedValueOnce([[1, 0, 0]])  // ensureEmbeddings for candidate
            .mockResolvedValueOnce([[1, 0, 0]]); // chat embedding

        const candidates = [makeCandidate(1, 'warrior of the north')];
        const boosts = await getEmbeddingSimilarityBoosts(candidates, 'warrior of the north');

        expect(boosts.size).toBe(1);
        expect(boosts.get(1)).toBe(8); // Cosine similarity 1.0 → boost 8
    });

    it('returns high boost for very similar embeddings', async () => {
        mockComputeEmbeddings = vi.fn()
            .mockResolvedValueOnce([[0.9, 0.1, 0]])
            .mockResolvedValueOnce([[0.9, 0.1, 0]]);

        const candidates = [makeCandidate(1, 'test')];
        const boosts = await getEmbeddingSimilarityBoosts(candidates, 'test');

        expect(boosts.get(1)).toBe(8);
    });

    it('returns medium boost for moderately similar embeddings', async () => {
        // Cosine similarity of [1,0] and [0.6,0.8] = 0.6 → boost 5
        mockComputeEmbeddings = vi.fn()
            .mockResolvedValueOnce([[1, 0]])
            .mockResolvedValueOnce([[0.6, 0.8]]);

        const candidates = [makeCandidate(1, 'test')];
        const boosts = await getEmbeddingSimilarityBoosts(candidates, 'test');

        expect(boosts.get(1)).toBeGreaterThanOrEqual(1);
    });

    it('returns no boost for dissimilar embeddings', async () => {
        // Cosine similarity of [1,0,0] and [-1,0,0] = -1 → no boost
        mockComputeEmbeddings = vi.fn()
            .mockResolvedValueOnce([[1, 0, 0]])
            .mockResolvedValueOnce([[-1, 0, 0]]);

        const candidates = [makeCandidate(1, 'test')];
        const boosts = await getEmbeddingSimilarityBoosts(candidates, 'test');

        expect(boosts.has(1)).toBe(false);
    });

    it('handles multiple candidates with different similarities', async () => {
        mockComputeEmbeddings = vi.fn()
            .mockResolvedValueOnce([
                [1, 0, 0],    // candidate 1: identical to chat
                [0, 1, 0],    // candidate 2: orthogonal to chat
            ])
            .mockResolvedValueOnce([[1, 0, 0]]); // chat embedding

        const candidates = [
            makeCandidate(1, 'matching text'),
            makeCandidate(2, 'unrelated text'),
        ];
        const boosts = await getEmbeddingSimilarityBoosts(candidates, 'matching text');

        expect(boosts.get(1)).toBe(8);     // High similarity
        expect(boosts.has(2)).toBe(false);  // No boost for orthogonal
    });

    it('returns empty map when embedding computation fails for chat text', async () => {
        mockComputeEmbeddings = vi.fn()
            .mockResolvedValueOnce([[1, 0, 0]])    // entry embeddings succeed
            .mockRejectedValueOnce(new Error('API error')); // chat embedding fails

        const candidates = [makeCandidate(1, 'test')];
        const boosts = await getEmbeddingSimilarityBoosts(candidates, 'test');

        expect(boosts.size).toBe(0);
    });

    it('uses cached embeddings on second call', async () => {
        mockComputeEmbeddings = vi.fn()
            .mockResolvedValueOnce([[1, 0, 0]])    // first call: compute entry embedding
            .mockResolvedValueOnce([[1, 0, 0]])    // first call: compute chat embedding
            .mockResolvedValueOnce([[1, 0, 0]]);   // second call: only chat embedding (entry is cached)

        const candidates = [makeCandidate(1, 'consistent content')];

        await getEmbeddingSimilarityBoosts(candidates, 'first query');
        await getEmbeddingSimilarityBoosts(candidates, 'second query');

        // ensureEmbeddings should skip cached entries on second call,
        // so computeEmbeddings is called for: batch1, chat1, chat2 = 3 calls
        expect(mockComputeEmbeddings).toHaveBeenCalledTimes(3);
    });

    it('recomputes embeddings after cache is cleared', async () => {
        mockComputeEmbeddings = vi.fn()
            .mockResolvedValue([[0.5, 0.5, 0]]);

        const candidates = [makeCandidate(1, 'test content')];

        await getEmbeddingSimilarityBoosts(candidates, 'query');
        clearEmbeddingCache();
        await getEmbeddingSimilarityBoosts(candidates, 'query');

        // After clear, entry embedding is recomputed: entry1, chat1, entry1-again, chat2 = 4 calls
        expect(mockComputeEmbeddings).toHaveBeenCalledTimes(4);
    });

    it('handles entries with empty content', async () => {
        mockComputeEmbeddings = vi.fn()
            .mockResolvedValueOnce([[0.5, 0.5]])
            .mockResolvedValueOnce([[0.5, 0.5]]);

        const candidates = [makeCandidate(1, '')];
        const boosts = await getEmbeddingSimilarityBoosts(candidates, 'test');

        // Should not throw; entry text is built from comment + content
        expect(boosts).toBeInstanceOf(Map);
    });

    it('handles null embedding result from sidecar', async () => {
        mockComputeEmbeddings = vi.fn()
            .mockResolvedValueOnce([null])  // entry embedding returns null
            .mockResolvedValueOnce([[1, 0, 0]]);

        const candidates = [makeCandidate(1, 'test')];
        const boosts = await getEmbeddingSimilarityBoosts(candidates, 'test');

        // No boost because entry embedding was null
        expect(boosts.has(1)).toBe(false);
    });
});
