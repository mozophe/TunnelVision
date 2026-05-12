/**
 * TunnelVision Prompt Injection Service
 *
 * Extracts prompt assembly and prompt installation from `index.js`.
 */

import { extension_prompt_types, extension_prompt_roles, setExtensionPrompt } from '../../../../script.js';
import { getContext } from '../../../st-context.js';

import { getSettings } from './tree-store.js';
import { getActiveTunnelVisionBooks, NOTEBOOK_NAME } from './tool-registry.js';
import { resetTurnEntryCount, invalidateDirtyWorldInfoCache } from './entry-manager.js';
import { setInjectionSizes } from './agent-utils.js';
import { buildNotebookPrompt, resetNotebookWriteGuard } from './tools/notebook.js';
import { buildWorldStatePrompt } from './world-state.js';
import { buildSmartContextPrompt } from './smart-context.js';
import { MIN_INJECTION_BUDGET_CHARS, BUDGET_TRIM_NEWLINE_RATIO } from './constants.js';

export const TV_PROMPT_KEY = 'tunnelvision_mandatory';
export const TV_NOTEBOOK_KEY = 'tunnelvision_notebook';
export const TV_WORLDSTATE_KEY = 'tunnelvision_worldstate';
export const TV_SMARTCTX_KEY = 'tunnelvision_smartcontext';
const TV_PROMPT_LOG_PREFIX = '[TunnelVision][PromptInjection]';

/**
 * Map a position setting string to the ST extension_prompt_types enum.
 * @param {string} val
 * @param {{ IN_PROMPT?: any, IN_CHAT?: any }} [promptTypes]
 * @returns {any}
 */
export function mapPositionSetting(val, promptTypes = extension_prompt_types) {
    switch (val) {
        case 'in_prompt': return promptTypes.IN_PROMPT;
        case 'in_chat':
        default: return promptTypes.IN_CHAT;
    }
}

/**
 * Map a role setting string to the ST extension_prompt_roles enum.
 * @param {string} val
 * @param {{ USER?: any, ASSISTANT?: any, SYSTEM?: any }} [promptRoles]
 * @returns {any}
 */
export function mapRoleSetting(val, promptRoles = extension_prompt_roles) {
    switch (val) {
        case 'user': return promptRoles.USER;
        case 'assistant': return promptRoles.ASSISTANT;
        case 'system':
        default: return promptRoles.SYSTEM;
    }
}

/**
 * Strip TunnelVision tool results from older chat messages to save context tokens.
 * Only strips tools in the user-configured filter list. Notebook is always immune.
 * Only strips from messages before the last user message (current turn is preserved).
 * Mutates chat data permanently.
 *
 * @param {object} [deps]
 * @param {Function} [deps.getSettingsImpl]
 * @param {Function} [deps.getContextImpl]
 * @param {string} [deps.notebookToolName]
 */
export function stripOldToolResults(deps = {}) {
    const {
        getSettingsImpl = getSettings,
        getContextImpl = getContext,
        notebookToolName = NOTEBOOK_NAME,
    } = deps;

    const settings = getSettingsImpl();
    const filterList = settings.ephemeralToolFilter;
    if (!Array.isArray(filterList) || filterList.length === 0) return;

    const strippable = new Set(filterList.filter(n => n !== notebookToolName));
    if (strippable.size === 0) return;

    const context = getContextImpl();
    const chat = context.chat;
    if (!chat || chat.length < 2) return;

    let lastUserIdx = -1;
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i].is_user) {
            lastUserIdx = i;
            break;
        }
    }
    if (lastUserIdx < 1) return;

    let stripped = 0;
    for (let i = 0; i < lastUserIdx; i++) {
        const invocations = chat[i]?.extra?.tool_invocations;
        if (!Array.isArray(invocations)) continue;

        for (const inv of invocations) {
            if (!inv.name || !strippable.has(inv.name)) continue;
            if (!inv.result || inv.result === ' ') continue;
            inv.result = ' ';
            stripped++;
        }
    }

    if (stripped > 0) {
        console.log(`[TunnelVision] Ephemeral mode: cleared ${stripped} old tool result(s) from context`);
    }
}

/**
 * Determines whether the current generation is a recursive tool pass by checking
 * the latest chat message for tool invocations.
 *
 * @param {object} [deps]
 * @param {Function} [deps.getContextImpl]
 * @returns {boolean}
 */
export function isRecursiveToolPass(deps = {}) {
    const { getContextImpl = getContext } = deps;
    const context = getContextImpl();
    const lastMsg = context.chat?.[context.chat.length - 1];
    const invocations = lastMsg?.extra?.tool_invocations;
    return Array.isArray(invocations) && invocations.length > 0;
}

/**
 * Applies the total prompt budget across prompt slots in priority order.
 *
 * Priority:
 * mandatory > worldState > smartContext > notebook
 *
 * @param {{
 *   mandatory?: string,
 *   worldState?: string,
 *   smartContext?: string,
 *   notebook?: string,
 * }} prompts
 * @param {number} budget
 * @param {object} [deps]
 * @param {number} [deps.minBudgetChars]
 * @param {number} [deps.trimNewlineRatio]
 * @returns {{
 *   mandatory: string,
 *   worldState: string,
 *   smartContext: string,
 *   notebook: string,
 * }}
 */
export function applyPromptBudget(prompts, budget, deps = {}) {
    const {
        minBudgetChars = MIN_INJECTION_BUDGET_CHARS,
        trimNewlineRatio = BUDGET_TRIM_NEWLINE_RATIO,
    } = deps;

    const result = {
        mandatory: prompts?.mandatory || '',
        worldState: prompts?.worldState || '',
        smartContext: prompts?.smartContext || '',
        notebook: prompts?.notebook || '',
    };

    if (!budget || budget <= 0) {
        return result;
    }

    let remaining = budget;
    const slots = [
        { key: 'mandatory' },
        { key: 'worldState' },
        { key: 'smartContext' },
        { key: 'notebook' },
    ];

    for (const slot of slots) {
        const text = result[slot.key];
        if (!text) continue;

        if (text.length <= remaining) {
            remaining -= text.length;
            continue;
        }

        if (remaining > minBudgetChars) {
            const cutoff = text.lastIndexOf('\n', remaining);
            const sliceAt = cutoff > remaining * trimNewlineRatio ? cutoff : remaining;
            result[slot.key] = `${text.substring(0, sliceAt)}\n[...budget limit reached]`;
            remaining = 0;
            continue;
        }

        result[slot.key] = '';
    }

    return result;
}

/**
 * Builds prompt payloads and metadata for the current generation.
 *
 * @param {object} [deps]
 * @param {Function} [deps.getSettingsImpl]
 * @param {Function} [deps.getActiveTunnelVisionBooksImpl]
 * @param {Function} [deps.buildWorldStatePromptImpl]
 * @param {Function} [deps.buildSmartContextPromptImpl]
 * @param {Function} [deps.buildNotebookPromptImpl]
 * @param {Function} [deps.setInjectionSizesImpl]
 * @param {Function} [deps.resetTurnEntryCountImpl]
 * @param {Function} [deps.invalidateDirtyWorldInfoCacheImpl]
 * @param {Function} [deps.resetNotebookWriteGuardImpl]
 * @param {Function} [deps.stripOldToolResultsImpl]
 * @param {Function} [deps.isRecursiveToolPassImpl]
 * @returns {Promise<{
 *   settings: object,
 *   activeBooks: Array,
 *   enabled: boolean,
 *   isRecursiveToolPass: boolean,
 *   prompts: {
 *     mandatory: string,
 *     worldState: string,
 *     smartContext: string,
 *     notebook: string,
 *   },
 *   promptMeta: {
 *     mandatory: { position: any, depth: number, role: any },
 *     worldState: { position: any, depth: number, role: any },
 *     smartContext: { position: any, depth: number, role: any },
 *     notebook: { position: any, depth: number, role: any },
 *   },
 * }>}
 */
export async function buildPromptInjectionPlan(deps = {}) {
    const {
        getSettingsImpl = getSettings,
        getActiveTunnelVisionBooksImpl = getActiveTunnelVisionBooks,
        buildWorldStatePromptImpl = buildWorldStatePrompt,
        buildSmartContextPromptImpl = buildSmartContextPrompt,
        buildNotebookPromptImpl = buildNotebookPrompt,
        setInjectionSizesImpl = setInjectionSizes,
        resetTurnEntryCountImpl = resetTurnEntryCount,
        invalidateDirtyWorldInfoCacheImpl = invalidateDirtyWorldInfoCache,
        resetNotebookWriteGuardImpl = resetNotebookWriteGuard,
        stripOldToolResultsImpl = stripOldToolResults,
        isRecursiveToolPassImpl = isRecursiveToolPass,
    } = deps;

    const settings = getSettingsImpl();
    const recursive = isRecursiveToolPassImpl({ getContextImpl: deps.getContextImpl });

    if (!recursive) {
        resetTurnEntryCountImpl();
        invalidateDirtyWorldInfoCacheImpl();
        resetNotebookWriteGuardImpl();
    }

    if (settings.ephemeralResults) {
        stripOldToolResultsImpl({
            getSettingsImpl,
            getContextImpl: deps.getContextImpl,
            notebookToolName: deps.notebookToolName,
        });
    }

    const activeBooks = getActiveTunnelVisionBooksImpl();
    const enabled = settings.globalEnabled !== false;

    console.log(`${TV_PROMPT_LOG_PREFIX} Building generation prompts`, {
        enabled,
        recursiveToolPass: recursive,
        activeBooks,
        worldStateEnabled: settings.worldStateEnabled === true,
        smartContextEnabled: settings.smartContextEnabled === true,
        notebookEnabled: settings.notebookEnabled !== false,
        totalInjectionBudget: settings.totalInjectionBudget || 0,
    });

    const promptMeta = {
        mandatory: {
            position: mapPositionSetting(settings.mandatoryPromptPosition, deps.promptTypes),
            depth: settings.mandatoryPromptDepth ?? 1,
            role: mapRoleSetting(settings.mandatoryPromptRole, deps.promptRoles),
        },
        worldState: {
            position: mapPositionSetting(settings.worldStatePosition, deps.promptTypes),
            depth: settings.worldStateDepth ?? 2,
            role: mapRoleSetting(settings.worldStateRole, deps.promptRoles),
        },
        smartContext: {
            position: mapPositionSetting(settings.smartContextPosition, deps.promptTypes),
            depth: settings.smartContextDepth ?? 3,
            role: mapRoleSetting(settings.smartContextRole, deps.promptRoles),
        },
        notebook: {
            position: mapPositionSetting(settings.notebookPromptPosition, deps.promptTypes),
            depth: settings.notebookPromptDepth ?? 1,
            role: mapRoleSetting(settings.notebookPromptRole, deps.promptRoles),
        },
    };

    let prompts = {
        mandatory: '',
        worldState: '',
        smartContext: '',
        notebook: '',
    };

    if (enabled) {
        if (!recursive && settings.mandatoryTools && activeBooks.length > 0) {
            prompts.mandatory = settings.mandatoryPromptText || '[IMPORTANT INSTRUCTION: You MUST use TunnelVision tools this turn.]';
        }

        if (settings.worldStateEnabled) {
            prompts.worldState = buildWorldStatePromptImpl();
        }

        if (settings.smartContextEnabled) {
            prompts.smartContext = buildSmartContextPromptImpl();
        } else {
            console.log(`${TV_PROMPT_LOG_PREFIX} Smart context skipped: disabled in settings`);
        }

        if (settings.notebookEnabled !== false) {
            prompts.notebook = buildNotebookPromptImpl();
        }
    }

    prompts = applyPromptBudget(prompts, settings.totalInjectionBudget || 0, {
        minBudgetChars: deps.minBudgetChars,
        trimNewlineRatio: deps.trimNewlineRatio,
    });

    setInjectionSizesImpl({
        mandatory: prompts.mandatory.length,
        worldState: prompts.worldState.length,
        smartContext: prompts.smartContext.length,
        notebook: prompts.notebook.length,
    });

    console.log(`${TV_PROMPT_LOG_PREFIX} Prompt build complete`, {
        mandatoryChars: prompts.mandatory.length,
        worldStateChars: prompts.worldState.length,
        smartContextChars: prompts.smartContext.length,
        notebookChars: prompts.notebook.length,
    });

    return {
        settings,
        activeBooks,
        enabled,
        isRecursiveToolPass: recursive,
        prompts,
        promptMeta,
    };
}

/**
 * Installs the prepared prompt payloads into SillyTavern's extension prompt slots.
 *
 * @param {{
 *   prompts: {
 *     mandatory: string,
 *     worldState: string,
 *     smartContext: string,
 *     notebook: string,
 *   },
 *   promptMeta: {
 *     mandatory: { position: any, depth: number, role: any },
 *     worldState: { position: any, depth: number, role: any },
 *     smartContext: { position: any, depth: number, role: any },
 *     notebook: { position: any, depth: number, role: any },
 *   },
 * }} payload
 * @param {object} [deps]
 * @param {Function} [deps.setExtensionPromptImpl]
 */
export function applyPromptInjectionPlan(payload, deps = {}) {
    const { setExtensionPromptImpl = setExtensionPrompt } = deps;

    setExtensionPromptImpl(
        TV_PROMPT_KEY,
        payload.prompts.mandatory,
        payload.promptMeta.mandatory.position,
        payload.promptMeta.mandatory.depth,
        false,
        payload.promptMeta.mandatory.role,
    );

    setExtensionPromptImpl(
        TV_WORLDSTATE_KEY,
        payload.prompts.worldState,
        payload.promptMeta.worldState.position,
        payload.promptMeta.worldState.depth,
        false,
        payload.promptMeta.worldState.role,
    );

    setExtensionPromptImpl(
        TV_SMARTCTX_KEY,
        payload.prompts.smartContext,
        payload.promptMeta.smartContext.position,
        payload.promptMeta.smartContext.depth,
        false,
        payload.promptMeta.smartContext.role,
    );

    setExtensionPromptImpl(
        TV_NOTEBOOK_KEY,
        payload.prompts.notebook,
        payload.promptMeta.notebook.position,
        payload.promptMeta.notebook.depth,
        false,
        payload.promptMeta.notebook.role,
    );
}

/**
 * @param {object} [deps]
 * @returns {Promise<ReturnType<typeof buildPromptInjectionPlan>>}
 */
export async function prepareAndInjectGenerationPrompts(deps = {}) {
    const payload = await buildPromptInjectionPlan(deps);
    applyPromptInjectionPlan(payload, deps);
    console.log(`${TV_PROMPT_LOG_PREFIX} Prompt injection applied`, {
        mandatoryChars: payload.prompts.mandatory.length,
        worldStateChars: payload.prompts.worldState.length,
        smartContextChars: payload.prompts.smartContext.length,
        notebookChars: payload.prompts.notebook.length,
    });
    return payload;
}

/**
 * Handles the generation-start prompt injection flow:
 * builds and injects prompts in the synchronous section, while containing
 * any prompt-assembly errors so the caller can continue with async repair logic.
 *
 * @param {object} [deps]
 * @returns {Promise<{ settings: object | undefined, isRecursiveToolPass: boolean }>}
 */
export async function handleGenerationStartedPromptInjection(deps = {}) {
    let settings;
    let isRecursiveToolPass = false;

    try {
        const payload = await prepareAndInjectGenerationPrompts(deps);
        settings = payload.settings;
        isRecursiveToolPass = payload.isRecursiveToolPass;
    } catch (e) {
        console.error('[TunnelVision] Error in onGenerationStarted synchronous section:', e);
    }

    return { settings, isRecursiveToolPass };
}