import { vi } from 'vitest';

export const saveSettingsDebounced = () => {};
export const chat = [];
export const eventSource = { on() {}, makeLast() {}, once() {} };
export const event_types = {};
export const saveChatConditional = () => {};
export const characters = [];
export const this_chid = 0;
export const chat_metadata = {};
export const generateQuietPrompt = async () => '';

export const extension_prompt_types = {
    IN_CHAT: 'IN_CHAT',
    IN_PROMPT: 'IN_PROMPT',
};

export const extension_prompt_roles = {
    SYSTEM: 'SYSTEM',
    USER: 'USER',
    ASSISTANT: 'ASSISTANT',
};

export const setExtensionPrompt = vi.fn();

export function __resetScriptMocks() {
    setExtensionPrompt.mockReset();
}