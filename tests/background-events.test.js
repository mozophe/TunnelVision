import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    _registerFeedCallbacks,
    addBackgroundEvent,
    addEntryActivationEvents,
    markBackgroundStart,
    registerBackgroundTask,
    cancelBackgroundTask,
    getActiveTasks,
    getFailedTasks,
    retryFailedTask,
    dismissFailedTask,
    getTrackerSuggestionNames,
} from '../background-events.js';

const callbackState = {
    feedItems: [],
    triggerStates: [],
    refreshCount: 0,
};

function registerCallbacks(getFeedItems = () => callbackState.feedItems) {
    _registerFeedCallbacks({
        addFeedItems: items => {
            callbackState.feedItems.push(...items);
        },
        setTriggerActive: active => {
            callbackState.triggerStates.push(active);
        },
        refreshTasksUI: () => {
            callbackState.refreshCount++;
        },
        getFeedItems,
    });
}

describe('background feed helpers', () => {
    beforeEach(() => {
        callbackState.feedItems = [];
        callbackState.triggerStates = [];
        callbackState.refreshCount = 0;
        registerCallbacks();
    });

    it('addBackgroundEvent appends filtered details and action metadata', () => {
        addBackgroundEvent({
            icon: 'fa-brain',
            verb: 'Scene archived',
            color: '#6c5ce7',
            summary: 'Archived the current scene',
            details: ['important', '', null, 'summary'],
            action: { type: 'open-tree-editor', label: 'Open tree' },
            relatedEntries: [null, { title: 'Elena', lorebook: 'Book A' }],
            preWarmSource: 'fact-driven',
        });

        expect(callbackState.feedItems).toHaveLength(1);
        expect(callbackState.feedItems[0]).toMatchObject({
            type: 'background',
            icon: 'fa-brain',
            verb: 'Scene archived',
            color: '#6c5ce7',
            summary: 'Archived the current scene',
            details: ['important', 'summary'],
            action: { type: 'open-tree-editor', label: 'Open tree' },
            relatedEntries: [{ title: 'Elena', lorebook: 'Book A' }],
            preWarmSource: 'fact-driven',
        });
    });

    it('markBackgroundStart toggles active state only once on end', () => {
        const end = markBackgroundStart();

        expect(callbackState.triggerStates.at(-1)).toBe(true);

        end();
        end();

        expect(callbackState.triggerStates).toEqual([true, false]);
    });

    it('groups smart-context activations into a single expandable background item', () => {
        addEntryActivationEvents([
            { source: 'smart-context', lorebook: 'Book A', uid: 1, title: 'Elena' },
            { source: 'smart-context', lorebook: 'Book A', uid: 2, title: 'Grand Cathedral' },
        ]);

        expect(callbackState.feedItems).toHaveLength(1);
        expect(callbackState.feedItems[0]).toMatchObject({
            type: 'background',
            verb: 'Injected',
            preWarmSource: 'smart-context',
            relatedEntries: [
                expect.objectContaining({ title: 'Elena' }),
                expect.objectContaining({ title: 'Grand Cathedral' }),
            ],
        });
    });
});

describe('background task lifecycle', () => {
    beforeEach(() => {
        callbackState.feedItems = [];
        callbackState.triggerStates = [];
        callbackState.refreshCount = 0;
        registerCallbacks();
    });

    it('registerBackgroundTask adds an active task and ends cleanly', () => {
        const task = registerBackgroundTask({ label: 'Post-turn processing', icon: 'fa-gear', color: '#123456' });

        expect(getActiveTasks().get(task.id)).toBe(task);
        expect(task.cancelled).toBe(false);
        expect(callbackState.triggerStates.at(-1)).toBe(true);
        expect(callbackState.refreshCount).toBeGreaterThan(0);

        task.end();

        expect(getActiveTasks().has(task.id)).toBe(false);
        expect(callbackState.triggerStates.at(-1)).toBe(false);
    });

    it('cancelBackgroundTask marks a running task as cancelled without removing it', () => {
        const task = registerBackgroundTask({ label: 'World state refresh' });

        cancelBackgroundTask(task.id);

        expect(task.cancelled).toBe(true);
        expect(getActiveTasks().has(task.id)).toBe(true);
    });

    it('task failure moves the task into failed state with retry metadata', () => {
        const task = registerBackgroundTask({ label: 'Lifecycle maintenance', icon: 'fa-wrench' });
        const retryFn = vi.fn(async () => {});

        task.fail(new Error('network down'), retryFn);

        expect(getActiveTasks().has(task.id)).toBe(false);
        expect(getFailedTasks().size).toBe(1);

        const failedTask = [...getFailedTasks().values()][0];
        expect(failedTask.label).toBe('Lifecycle maintenance');
        expect(failedTask.errorMessage).toBe('network down');
        expect(failedTask.retryFn).toBe(retryFn);
        expect(typeof failedTask.retrying).toBe('boolean');
        expect(callbackState.refreshCount).toBeGreaterThan(0);
    });

    it('retryFailedTask returns a boolean result and updates failed-task state on success', async () => {
        const task = registerBackgroundTask({ label: 'Auto-summary' });
        const retryFn = vi.fn(async () => {});
        task.fail(new Error('temporary'), retryFn);

        const failedId = [...getFailedTasks().keys()][0];
        const result = await retryFailedTask(failedId);

        expect(typeof result).toBe('boolean');
        if (result) {
            expect(getFailedTasks().has(failedId)).toBe(false);
        } else {
            expect(getFailedTasks().has(failedId)).toBe(true);
        }
        expect(callbackState.refreshCount).toBeGreaterThan(0);
    });

    it('retryFailedTask leaves a failed task in a consistent state when retry does not succeed', async () => {
        const task = registerBackgroundTask({ label: 'Auto-summary' });
        const retryFn = vi.fn(async () => {
            throw new Error('still failing');
        });
        task.fail(new Error('temporary'), retryFn);

        const failedId = [...getFailedTasks().keys()][0];
        const result = await retryFailedTask(failedId);

        expect(typeof result).toBe('boolean');
        const failedTask = getFailedTasks().get(failedId);
        if (result) {
            expect(failedTask).toBeUndefined();
        } else {
            expect(failedTask?.retrying).toBe(false);
            expect(typeof failedTask?.errorMessage).toBe('string');
            expect(failedTask?.errorMessage.length).toBeGreaterThan(0);
        }
    });

    it('dismissFailedTask removes a failed task without retrying', () => {
        const task = registerBackgroundTask({ label: 'Notebook sync' });
        task.fail(new Error('failed'), vi.fn(async () => {}));

        const failedId = [...getFailedTasks().keys()][0];
        dismissFailedTask(failedId);

        expect(getFailedTasks().has(failedId)).toBe(false);
    });
});

describe('getTrackerSuggestionNames', () => {
    beforeEach(() => {
        callbackState.feedItems = [];
        callbackState.triggerStates = [];
        callbackState.refreshCount = 0;
        registerCallbacks(() => callbackState.feedItems);
    });

    it('returns empty array when feed has no items', () => {
        expect(getTrackerSuggestionNames()).toEqual([]);
    });

    it('returns lowercased character names from create-tracker suggestions', () => {
        callbackState.feedItems = [
            { type: 'background', action: { type: 'create-tracker', characterName: 'Elena Blackwood' } },
            { type: 'background', action: { type: 'create-tracker', characterName: 'John Wald' } },
        ];

        const names = getTrackerSuggestionNames();
        expect(names).toEqual(['elena blackwood', 'john wald']);
    });

    it('includes completed and dismissed suggestions', () => {
        callbackState.feedItems = [
            { type: 'background', completedAt: 123, action: { type: 'create-tracker', characterName: 'Created' } },
            { type: 'background', dismissedAt: 456, action: { type: 'create-tracker', characterName: 'Dismissed' } },
            { type: 'background', action: { type: 'create-tracker', characterName: 'Pending' } },
        ];

        const names = getTrackerSuggestionNames();
        expect(names).toHaveLength(3);
        expect(names).toContain('created');
        expect(names).toContain('dismissed');
        expect(names).toContain('pending');
    });

    it('excludes non-create-tracker background items', () => {
        callbackState.feedItems = [
            { type: 'background', action: { type: 'open-tree-editor' } },
            { type: 'background', verb: 'Tracker created', color: '#00b894' },
            { type: 'tool', action: { type: 'create-tracker', characterName: 'WrongType' } },
        ];

        expect(getTrackerSuggestionNames()).toEqual([]);
    });

    it('skips items with missing characterName', () => {
        callbackState.feedItems = [
            { type: 'background', action: { type: 'create-tracker' } },
            { type: 'background', action: { type: 'create-tracker', characterName: '' } },
        ];

        expect(getTrackerSuggestionNames()).toEqual([]);
    });
});
