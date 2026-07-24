import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../st-context.js', () => ({ getContext: vi.fn() }));
vi.mock('../../../../script.js', () => ({
    setExtensionPrompt: vi.fn(),
    extension_prompt_types: { IN_PROMPT: 0, IN_CHAT: 1, BEFORE_PROMPT: 2 },
    extension_prompt_roles: { SYSTEM: 0, USER: 1, ASSISTANT: 2 },
}));
vi.mock('../../../world-info.js', () => ({ loadWorldInfo: vi.fn(async () => ({ entries: {} })) }));
vi.mock('../tree-store.js', () => ({
    getTree: vi.fn(() => ({ root: { id: 'root', label: 'Root', children: [{ id: 'n1', label: 'Node 1', children: [] }] } })),
    findNodeById: vi.fn(() => null),
    getAllEntryUids: vi.fn(() => []),
    getSettings: vi.fn(() => ({ sidecarAutoRetrieval: true, sidecarContextMessages: 10, conditionalTriggersEnabled: false })),
    isNativeInjectionBook: vi.fn(() => false),
}));
vi.mock('../tool-registry.js', () => ({ getReadableBooks: vi.fn(() => ['Book']) }));
vi.mock('../conditions.js', () => ({
    hasEvaluableConditions: vi.fn(() => false),
    separateConditions: vi.fn(() => ({ conditions: [], keywords: [] })),
    mapSelectiveLogic: vi.fn(() => 'AND_ANY'),
    describeSelectiveLogic: vi.fn(() => ''),
    rollKeywordProbability: vi.fn(() => true),
    formatCondition: vi.fn(() => ''),
    CONDITION_DESCRIPTIONS: {},
    CONDITION_LABELS: {},
}));
vi.mock('../llm-sidecar.js', () => ({
    isSidecarConfigured: vi.fn(() => true),
    isCircuitOpen: vi.fn(() => false),
    sidecarGenerate: vi.fn(async () => { throw Object.assign(new Error('Sidecar cancelled'), { name: 'TVAbortError', cancelled: true }); }),
    getSidecarModelLabel: vi.fn(() => 'test-model'),
}));
vi.mock('../activity-feed.js', () => ({
    logSidecarRetrieval: vi.fn(),
    logConditionalEvaluations: vi.fn(),
    setSidecarActive: vi.fn(),
}));
vi.mock('../index.js', () => ({ getKeywordTriggeredUids: vi.fn(() => []) }));
vi.mock('../agent-utils.js', () => ({
    applyBackgroundPromptAddendum: vi.fn(s => s),
    buildLanguageDirective: vi.fn(() => ''),
}));

const { getContext } = await import('../../../st-context.js');
const { setExtensionPrompt } = await import('../../../../script.js');
const { runSidecarRetrieval } = await import('../sidecar-retrieval.js');

const CHAT = [
    { is_user: true, is_system: false, mes: 'user question here' },
    { is_user: false, is_system: false, mes: 'assistant reply here' },
];

describe('sidecar retrieval — cancellation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getContext.mockReturnValue({ chat: CHAT });
    });

    it('resolves without throwing when the sidecar call is cancelled', async () => {
        await expect(runSidecarRetrieval()).resolves.toBeUndefined();
    });

    it('clears the retrieval prompt on cancel', async () => {
        await runSidecarRetrieval();
        // clearRetrievalPrompt sets the retrieval key to an empty string.
        const clearedCall = setExtensionPrompt.mock.calls.find(
            ([key, text]) => key === 'tunnelvision_sidecar_retrieval' && text === '',
        );
        expect(clearedCall).toBeTruthy();
    });
});
