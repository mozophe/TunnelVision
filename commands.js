/**
 * TunnelVision Slash Commands
 * Registers /tv-* slash commands for forcing tool actions.
 *
 * Commands use generateAnalytical() for LLM reasoning, then call entry-manager
 * functions directly for CRUD. No generateQuietPrompt — no hoping the chat model
 * decides to call a tool.
 *
 * Commands:
 *   /tv-search [query]     — Search lorebook entries
 *   /tv-remember [content] — Save content to memory
 *   /tv-summarize [title]  — Create a scene summary
 *   /tv-forget [name]      — Forget/disable an entry
 *   /tv-merge [hint]       — Merge duplicate/related entries
 *   /tv-split [hint]       — Split a multi-topic entry
 *   /tv-ingest [lorebook]  — Ingest recent chat messages (no generation)
 *
 * Settings consumed (from tree-store.js getSettings()):
 *   commandContextMessages number   default 50
 */

import { getContext } from '../../../st-context.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandArgument, ARGUMENT_TYPE } from '../../../slash-commands/SlashCommandArgument.js';
import { loadWorldInfo } from '../../../world-info.js';
import { getSettings, getSelectedLorebook, getTree } from './tree-store.js';
import { getActiveTunnelVisionBooks, resolveTargetBook } from './tool-registry.js';
import { ingestChatMessages } from './tree-builder.js';
import { createEntry, mergeEntries, splitEntry, forgetEntry, findEntryByUid } from './entry-manager.js';
import { generateAnalytical, getStoryContext } from './agent-utils.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let _initialized = false;

/**
 * Register all /tv-* slash commands.
 * Safe to call multiple times — idempotency guard prevents duplicate registration.
 */
export function initCommands() {
    if (_initialized) return;
    _initialized = true;

    registerSlashCommands();
}

// ---------------------------------------------------------------------------
// Slash command registration
// ---------------------------------------------------------------------------

function registerSlashCommands() {
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'tv-search',
        callback: wrapCallback(handleSearch),
        helpString: 'Search TunnelVision lorebook entries.',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Search query',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
        ],
        returns: 'empty string',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'tv-remember',
        callback: wrapCallback(handleRemember),
        helpString: 'Save content to TunnelVision memory.',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Content to remember',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
        ],
        returns: 'empty string',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'tv-summarize',
        callback: wrapCallback(handleSummarize),
        helpString: 'Create a TunnelVision scene summary from recent chat.',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Summary title',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
        ],
        returns: 'empty string',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'tv-forget',
        callback: wrapCallback(handleForget),
        helpString: 'Forget/disable a TunnelVision lorebook entry.',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Entry name or UID to forget',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
        ],
        returns: 'empty string',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'tv-merge',
        callback: wrapCallback(handleMerge),
        helpString: 'Merge duplicate/related TunnelVision lorebook entries.',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Hint about which entries to merge (optional — auto-detects duplicates)',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
        ],
        returns: 'empty string',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'tv-split',
        callback: wrapCallback(handleSplit),
        helpString: 'Split a multi-topic TunnelVision lorebook entry into focused pieces.',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Entry name or UID to split',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
        ],
        returns: 'empty string',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'tv-ingest',
        callback: wrapCallback(handleIngestCommand),
        helpString: 'Ingest recent chat messages into a TunnelVision lorebook (no generation).',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Target lorebook name (optional if only one active)',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
        ],
        returns: 'empty string',
    }));
}

// ---------------------------------------------------------------------------
// Callback wrapper — shared precondition checks + error handling
// ---------------------------------------------------------------------------

function wrapCallback(handler) {
    return async function (namedArgs, unnamedArg) {
        try {
            const settings = getSettings();
            if (settings.globalEnabled === false) {
                toastr.warning('TunnelVision is disabled.', 'TunnelVision');
                return '';
            }

            const activeBooks = getActiveTunnelVisionBooks();
            if (activeBooks.length === 0) {
                toastr.warning('No active TunnelVision lorebooks.', 'TunnelVision');
                return '';
            }

            await handler(namedArgs, unnamedArg, { settings, activeBooks });
        } catch (err) {
            console.error('[TunnelVision] Slash command failed:', err);
            toastr.error(`Command failed: ${err.message}`, 'TunnelVision');
        }
        return '';
    };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function resolveCurrentLorebook(activeBooks) {
    const selectedLorebook = getSelectedLorebook();
    if (selectedLorebook && activeBooks.includes(selectedLorebook)) {
        return selectedLorebook;
    }
    return activeBooks.length === 1 ? activeBooks[0] : null;
}

function resolveBook(activeBooks) {
    const name = resolveCurrentLorebook(activeBooks);
    if (!name && activeBooks.length > 1) {
        toastr.warning('Multiple lorebooks active — select one in TunnelVision settings first.', 'TunnelVision');
        return null;
    }
    return name || activeBooks[0];
}

function getContextMessages() {
    const settings = getSettings();
    return Number(settings.commandContextMessages) || 50;
}

/**
 * Build a compact entry listing from a lorebook for LLM consumption.
 * @returns {Promise<string>} Formatted entry list, or empty string
 */
async function buildEntryListing(bookName) {
    const bookData = await loadWorldInfo(bookName);
    if (!bookData?.entries) return '';

    const lines = [];
    for (const entry of Object.values(bookData.entries)) {
        if (entry.disable) continue;
        const title = (entry.comment || '').trim() || `Entry #${entry.uid}`;
        const preview = (entry.content || '').substring(0, 120).replace(/\n/g, ' ');
        lines.push(`- UID ${entry.uid}: "${title}" — ${preview}`);
    }
    return lines.join('\n');
}

/**
 * Get recent chat as a compact text block for LLM context.
 */
function getRecentChat(messageCount) {
    try {
        const context = getContext();
        const chat = context?.chat;
        if (!chat || chat.length === 0) return '';

        const start = Math.max(0, chat.length - messageCount);
        const lines = [];
        for (let i = start; i < chat.length; i++) {
            const msg = chat[i];
            if (msg.is_system) continue;
            const name = msg.is_user ? (context.name1 || 'User') : (msg.name || context.name2 || 'AI');
            const text = (msg.mes || '').substring(0, 300);
            lines.push(`${name}: ${text}`);
        }
        return lines.join('\n');
    } catch {
        return '';
    }
}

/**
 * Parse JSON from an LLM response, handling markdown fences.
 */
function parseJSON(text) {
    if (!text) return null;
    // Strip markdown code fences
    const stripped = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim();
    try {
        return JSON.parse(stripped);
    } catch {
        // Try to find the first { or [ and parse from there
        const start = stripped.search(/[{[]/);
        if (start >= 0) {
            try { return JSON.parse(stripped.substring(start)); } catch { /* fall through */ }
        }
        return null;
    }
}

// ---------------------------------------------------------------------------
// Command handlers — generateAnalytical for reasoning, direct CRUD for action
// ---------------------------------------------------------------------------

async function handleSearch(_namedArgs, unnamedArg, { activeBooks }) {
    const bookName = resolveBook(activeBooks);
    if (!bookName) return;

    const query = String(unnamedArg || '').trim();
    if (!query) {
        toastr.warning('Usage: /tv-search <query>', 'TunnelVision');
        return;
    }

    const entryList = await buildEntryListing(bookName);
    if (!entryList) {
        toastr.warning(`No entries found in "${bookName}".`, 'TunnelVision');
        return;
    }

    toastr.info('Searching...', 'TunnelVision');

    const prompt = `Search this lorebook for entries relevant to: "${query}"

ENTRIES IN "${bookName}":
${entryList}

Return JSON: { "results": [{ "uid": <number>, "title": "<string>", "relevance": "<why this matches>" }] }
Return only the most relevant entries (max 10). If nothing matches, return { "results": [] }.`;

    const response = await generateAnalytical({ prompt });
    const parsed = parseJSON(response);

    if (!parsed?.results?.length) {
        toastr.info('No matching entries found.', 'TunnelVision');
        return;
    }

    // Display results
    const bookData = await loadWorldInfo(bookName);
    const resultLines = [];
    for (const r of parsed.results) {
        const entry = bookData?.entries ? findEntryByUid(bookData.entries, r.uid) : null;
        if (entry) {
            resultLines.push(`**${entry.comment || 'Untitled'}** (UID ${r.uid}): ${(entry.content || '').substring(0, 200)}`);
        }
    }

    if (resultLines.length > 0) {
        toastr.success(`Found ${resultLines.length} matching entries.`, 'TunnelVision');
        console.log(`[TunnelVision] /tv-search results for "${query}":\n${resultLines.join('\n')}`);
    } else {
        toastr.info('Search returned UIDs that could not be resolved.', 'TunnelVision');
    }
}

async function handleRemember(_namedArgs, unnamedArg, { activeBooks }) {
    const bookName = resolveBook(activeBooks);
    if (!bookName) return;

    const content = String(unnamedArg || '').trim();
    if (!content) {
        toastr.warning('Usage: /tv-remember <content to save>', 'TunnelVision');
        return;
    }

    const { book: lorebook, error } = resolveTargetBook(bookName, { checkWrite: true });
    if (error) {
        toastr.error(error, 'TunnelVision');
        return;
    }

    // Check if this looks like a tracker/schema design request
    const isSchemaRequest = /\b(design|schema|track(er|ing)?|template|format|struct(ure)?)\b/i.test(content);

    if (isSchemaRequest) {
        toastr.info('Designing tracker schema...', 'TunnelVision');

        const storyCtx = getStoryContext();
        const prompt = `${storyCtx ? storyCtx + '\n\n' : ''}Design a tracker schema for a creative writing lorebook based on this request: "${content}"

Create a well-structured format using headers, bullet points, and key:value pairs that will be easy to update each turn.
Include placeholder values that demonstrate the format. Make it comprehensive but organized.

Return JSON:
{
  "title": "[Tracker] <descriptive title>",
  "content": "<the full tracker schema with placeholders>"
}`;

        const response = await generateAnalytical({ prompt });
        const parsed = parseJSON(response);

        if (!parsed?.title || !parsed?.content) {
            toastr.error('Failed to design tracker schema — could not parse LLM response.', 'TunnelVision');
            return;
        }

        try {
            const result = await createEntry(lorebook, {
                content: parsed.content,
                comment: parsed.title,
                keys: [],
            });
            toastr.success(`Tracker saved: "${result.comment}" (UID ${result.uid})`, 'TunnelVision');
        } catch (e) {
            toastr.error(`Failed to save tracker: ${e.message}`, 'TunnelVision');
        }
        return;
    }

    // Simple content — save directly, no LLM needed
    toastr.info('Saving to memory...', 'TunnelVision');
    try {
        const title = content.length > 60 ? content.substring(0, 57) + '...' : content;
        const result = await createEntry(lorebook, {
            content,
            comment: title,
            keys: [],
        });
        toastr.success(`Saved: "${result.comment}" (UID ${result.uid})`, 'TunnelVision');
    } catch (e) {
        toastr.error(`Failed to save: ${e.message}`, 'TunnelVision');
    }
}

async function handleSummarize(_namedArgs, unnamedArg, { activeBooks }) {
    const bookName = resolveBook(activeBooks);
    if (!bookName) return;

    const { book: lorebook, error } = resolveTargetBook(bookName, { checkWrite: true });
    if (error) {
        toastr.error(error, 'TunnelVision');
        return;
    }

    const titleHint = String(unnamedArg || '').trim() || 'Recent events';
    const messageCount = getContextMessages();
    const recentChat = getRecentChat(messageCount);

    if (!recentChat) {
        toastr.warning('No chat messages to summarize.', 'TunnelVision');
        return;
    }

    toastr.info('Creating summary...', 'TunnelVision');

    const storyCtx = getStoryContext();
    const prompt = `${storyCtx ? storyCtx + '\n\n' : ''}Summarize the following conversation for a creative writing lorebook.
Write in third person, past tense, capturing key actions, decisions, emotional beats, and plot developments.

Topic/title hint: "${titleHint}"

RECENT CONVERSATION:
${recentChat}

Return JSON:
{
  "title": "[Summary] <concise descriptive title>",
  "summary": "<thorough third-person past-tense summary>",
  "significance": "minor|moderate|major|critical"
}`;

    const response = await generateAnalytical({ prompt });
    const parsed = parseJSON(response);

    if (!parsed?.title || !parsed?.summary) {
        toastr.error('Failed to create summary — could not parse LLM response.', 'TunnelVision');
        return;
    }

    try {
        const sig = parsed.significance || 'moderate';
        const content = `[Scene Summary — ${sig}]\n\n${parsed.summary.trim()}`;
        const result = await createEntry(lorebook, {
            content,
            comment: parsed.title,
            keys: [],
        });
        toastr.success(`Summary saved: "${result.comment}" (UID ${result.uid})`, 'TunnelVision');
    } catch (e) {
        toastr.error(`Failed to save summary: ${e.message}`, 'TunnelVision');
    }
}

async function handleForget(_namedArgs, unnamedArg, { activeBooks }) {
    const bookName = resolveBook(activeBooks);
    if (!bookName) return;

    const target = String(unnamedArg || '').trim();
    if (!target) {
        toastr.warning('Usage: /tv-forget <entry name or UID>', 'TunnelVision');
        return;
    }

    // If the user gave a numeric UID, use it directly
    const directUid = parseInt(target, 10);
    if (!isNaN(directUid) && String(directUid) === target) {
        toastr.info(`Forgetting entry UID ${directUid}...`, 'TunnelVision');
        try {
            const result = await forgetEntry(bookName, directUid);
            toastr.success(`Forgotten: "${result.comment}" (${result.action})`, 'TunnelVision');
        } catch (e) {
            toastr.error(`Failed to forget: ${e.message}`, 'TunnelVision');
        }
        return;
    }

    // Otherwise, ask the LLM to identify the entry by name
    const entryList = await buildEntryListing(bookName);
    if (!entryList) {
        toastr.warning(`No entries found in "${bookName}".`, 'TunnelVision');
        return;
    }

    toastr.info('Identifying entry to forget...', 'TunnelVision');

    const prompt = `The user wants to forget/remove this entry from their lorebook: "${target}"

ENTRIES IN "${bookName}":
${entryList}

Which entry best matches their request? Return JSON: { "uid": <number>, "title": "<entry title>", "reason": "<why this matches>" }
If no entry matches, return { "uid": null, "reason": "No matching entry found" }.`;

    const response = await generateAnalytical({ prompt });
    const parsed = parseJSON(response);

    if (!parsed?.uid) {
        toastr.warning(`Could not identify an entry matching "${target}".`, 'TunnelVision');
        return;
    }

    try {
        const result = await forgetEntry(bookName, parsed.uid);
        toastr.success(`Forgotten: "${result.comment}" (UID ${parsed.uid}, ${result.action})`, 'TunnelVision');
    } catch (e) {
        toastr.error(`Failed to forget UID ${parsed.uid}: ${e.message}`, 'TunnelVision');
    }
}

async function handleMerge(_namedArgs, unnamedArg, { activeBooks }) {
    const bookName = resolveBook(activeBooks);
    if (!bookName) return;

    const hint = String(unnamedArg || '').trim();
    const entryList = await buildEntryListing(bookName);
    if (!entryList) {
        toastr.warning(`No entries found in "${bookName}".`, 'TunnelVision');
        return;
    }

    toastr.info('Identifying entries to merge...', 'TunnelVision');

    const hintClause = hint
        ? `The user specifically wants to merge entries related to: "${hint}"`
        : 'Find the two most similar/overlapping entries that should be consolidated.';

    const prompt = `${hintClause}

ENTRIES IN "${bookName}":
${entryList}

Identify two entries that cover the same topic and should be merged into one.
Pick the entry with the better content as "keep_uid" and the redundant one as "remove_uid".
Write clean, consolidated merged content that combines the best of both.

Return JSON:
{
  "keep_uid": <number>,
  "remove_uid": <number>,
  "merged_title": "<clean title for the merged entry>",
  "merged_content": "<consolidated content combining both entries>",
  "reason": "<why these should be merged>"
}
If no entries should be merged, return { "keep_uid": null, "reason": "No duplicate entries found" }.`;

    const response = await generateAnalytical({ prompt });
    const parsed = parseJSON(response);

    if (!parsed?.keep_uid || !parsed?.remove_uid) {
        toastr.info(parsed?.reason || 'No entries identified for merging.', 'TunnelVision');
        return;
    }

    try {
        const result = await mergeEntries(bookName, parsed.keep_uid, parsed.remove_uid, {
            mergedContent: parsed.merged_content,
            mergedTitle: parsed.merged_title,
        });
        toastr.success(
            `Merged: "${result.removedComment}" (UID ${result.removedUid}) → "${result.comment}" (UID ${result.uid})`,
            'TunnelVision',
        );
    } catch (e) {
        toastr.error(`Merge failed: ${e.message}`, 'TunnelVision');
    }
}

async function handleSplit(_namedArgs, unnamedArg, { activeBooks }) {
    const bookName = resolveBook(activeBooks);
    if (!bookName) return;

    const hint = String(unnamedArg || '').trim();
    const entryList = await buildEntryListing(bookName);
    if (!entryList) {
        toastr.warning(`No entries found in "${bookName}".`, 'TunnelVision');
        return;
    }

    // If user gave a UID, target that entry specifically
    const directUid = parseInt(hint, 10);
    let targetEntry = null;
    if (!isNaN(directUid) && String(directUid) === hint) {
        const bookData = await loadWorldInfo(bookName);
        targetEntry = bookData?.entries ? findEntryByUid(bookData.entries, directUid) : null;
    }

    toastr.info('Analyzing entry for split...', 'TunnelVision');

    const targetClause = targetEntry
        ? `Split this specific entry (UID ${directUid}, "${targetEntry.comment || ''}"):\n${targetEntry.content}`
        : hint
            ? `The user wants to split an entry related to: "${hint}"\n\nENTRIES IN "${bookName}":\n${entryList}`
            : `Find the entry that covers too many topics and should be split.\n\nENTRIES IN "${bookName}":\n${entryList}`;

    const prompt = `${targetClause}

Identify one entry that covers multiple distinct topics and split it into two focused entries.

Return JSON:
{
  "uid": <number>,
  "keep_content": "<content that stays in the original entry>",
  "keep_title": "<updated title for the original entry>",
  "new_content": "<content for the new split-off entry>",
  "new_title": "<title for the new entry>",
  "reason": "<why this split improves organization>"
}
If no entry needs splitting, return { "uid": null, "reason": "No entries need splitting" }.`;

    const response = await generateAnalytical({ prompt });
    const parsed = parseJSON(response);

    if (!parsed?.uid) {
        toastr.info(parsed?.reason || 'No entries identified for splitting.', 'TunnelVision');
        return;
    }

    try {
        const result = await splitEntry(bookName, parsed.uid, {
            keepContent: parsed.keep_content,
            keepTitle: parsed.keep_title,
            newContent: parsed.new_content,
            newTitle: parsed.new_title,
        });
        toastr.success(
            `Split: "${result.originalTitle}" → kept + new "${result.newTitle}" (UID ${result.newUid})`,
            'TunnelVision',
        );
    } catch (e) {
        toastr.error(`Split failed: ${e.message}`, 'TunnelVision');
    }
}

// ---------------------------------------------------------------------------
// Ingest handler (unchanged — already uses direct action)
// ---------------------------------------------------------------------------

async function handleIngestCommand(_namedArgs, unnamedArg, { activeBooks }) {
    const requested = String(unnamedArg || '').trim();
    let targetLorebook;

    if (requested) {
        targetLorebook = activeBooks.find(b => b.toLowerCase() === requested.toLowerCase()) || null;
        if (!targetLorebook) {
            toastr.warning(`Lorebook "${requested}" not found among active books.`, 'TunnelVision');
            return;
        }
    } else {
        targetLorebook = resolveBook(activeBooks);
    }

    if (!targetLorebook) return;

    const contextMessages = getContextMessages();

    try {
        const context = getContext();
        const chat = context?.chat;

        if (!chat || chat.length === 0) {
            toastr.error('No chat is open. Open a chat before ingesting.', 'TunnelVision');
            return;
        }

        const from = Math.max(0, chat.length - contextMessages);
        const to = chat.length - 1;

        toastr.info(`Ingesting messages ${from}\u2013${to} into "${targetLorebook}"\u2026`, 'TunnelVision');

        const result = await ingestChatMessages(targetLorebook, {
            from,
            to,
            progress: (msg) => toastr.info(msg, 'TunnelVision'),
            detail: () => {},
        });

        toastr.success(
            `Ingested ${result.created} entr${result.created === 1 ? 'y' : 'ies'} ` +
            `(${result.errors} error${result.errors === 1 ? '' : 's'}).`,
            'TunnelVision',
        );
    } catch (err) {
        console.error('[TunnelVision] /tv-ingest failed:', err);
        toastr.error(`Ingest failed: ${err.message}`, 'TunnelVision');
    }
}
