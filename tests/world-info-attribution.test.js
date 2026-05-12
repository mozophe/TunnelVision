import { describe, expect, it } from 'vitest';

import { getWorldInfoAttribution, withWorldInfoAttribution } from '../world-info-attribution.js';

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe('world-info attribution', () => {
    it('sets and restores attribution around a scoped operation', async () => {
        expect(getWorldInfoAttribution()).toBeNull();

        const value = await withWorldInfoAttribution('post-turn', async () => {
            expect(getWorldInfoAttribution()).toBe('post-turn');
            return 42;
        });

        expect(value).toBe(42);
        expect(getWorldInfoAttribution()).toBeNull();
    });

    it('restores the previous attribution after nested scopes complete', async () => {
        await withWorldInfoAttribution('post-turn', async () => {
            expect(getWorldInfoAttribution()).toBe('post-turn');

            await withWorldInfoAttribution('world-state', async () => {
                expect(getWorldInfoAttribution()).toBe('world-state');
            });

            expect(getWorldInfoAttribution()).toBe('post-turn');
        });

        expect(getWorldInfoAttribution()).toBeNull();
    });

    it('keeps the later same-source scope active when an earlier one finishes first', async () => {
        const first = createDeferred();
        const second = createDeferred();

        const firstRun = withWorldInfoAttribution('post-turn', async () => {
            expect(getWorldInfoAttribution()).toBe('post-turn');
            await first.promise;
        });

        const secondRun = withWorldInfoAttribution('post-turn', async () => {
            expect(getWorldInfoAttribution()).toBe('post-turn');
            await second.promise;
        });

        first.resolve();
        await firstRun;
        expect(getWorldInfoAttribution()).toBe('post-turn');

        second.resolve();
        await secondRun;
        expect(getWorldInfoAttribution()).toBeNull();
    });

    it('restores state after an error', async () => {
        await expect(withWorldInfoAttribution('world-state', async () => {
            expect(getWorldInfoAttribution()).toBe('world-state');
            throw new Error('boom');
        })).rejects.toThrow('boom');

        expect(getWorldInfoAttribution()).toBeNull();
    });
});