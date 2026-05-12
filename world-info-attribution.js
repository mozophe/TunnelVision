/**
 * Scoped attribution for WORLD_INFO_ACTIVATED events triggered during
 * background prompt construction.
 *
 * This is intentionally narrower than task-level "is running" flags.
 * Callers should wrap only the actual generation attempt that may cause
 * world-info retrieval, not the whole background workflow.
 */

const _attributionStack = [];

export function getWorldInfoAttribution() {
    return _attributionStack.length > 0
        ? _attributionStack[_attributionStack.length - 1]
        : null;
}

export async function withWorldInfoAttribution(source, operation) {
    if (typeof operation !== 'function') {
        throw new TypeError('withWorldInfoAttribution requires an operation function');
    }

    _attributionStack.push(source);
    try {
        return await operation();
    } finally {
        for (let index = _attributionStack.length - 1; index >= 0; index--) {
            if (_attributionStack[index] === source) {
                _attributionStack.splice(index, 1);
                break;
            }
        }
    }
}