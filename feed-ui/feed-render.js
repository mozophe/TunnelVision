/**
 * TunnelVision Activity Feed — Render/UI Module
 *
 * Renders feed rows, active/failed background task rows, and expandable
 * item detail panels. Extracted from activity-feed.js to keep orchestration
 * separate from UI behavior.
 */

import { getPanelBody, getPanelEl, getShowingArcs, getShowingTimeline, getShowingWorldState, getFeedItemsRaw, MAX_RENDERED_RETRIEVED_ENTRIES, setLorebookStatsCache } from '../feed-state.js';
import { formatTime, formatEntrySummary, formatRetrievedEntryLabel, shouldIncludeLorebookForEntries, buildVersionHistoryPanel } from '../feed-helpers.js';
import { getActiveTasks, getFailedTasks, cancelBackgroundTask, retryFailedTask, dismissFailedTask, addBackgroundEvent } from '../background-events.js';
import { findEntry, getEntryVersions } from '../entry-manager.js';
import { openTreeEditorForBook } from '../ui-controller.js';
import { createTrackerForCharacter } from '../post-turn-processor.js';
import { getActiveTab } from './feed-panel.js';

function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
}

function icon(iconClass) {
    const i = document.createElement('i');
    i.className = `fa-solid ${iconClass}`;
    return i;
}

function buildEntrySourceIcon(source) {
    const sourceMeta = source === 'smart-context'
        ? { iconClass: 'fa-wand-magic-sparkles', label: 'Smart Context', extraClass: 'tv-float-source-icon-smart-context' }
        : source === 'post-turn'
            ? { iconClass: 'fa-brain', label: 'Post-turn', extraClass: 'tv-float-source-icon-post-turn' }
            : source === 'world-state'
                ? { iconClass: 'fa-globe', label: 'World State', extraClass: 'tv-float-source-icon-world-state' }
            : null;

    if (!sourceMeta) return null;

    const badge = el('span', `tv-float-source-icon ${sourceMeta.extraClass}`);
    badge.title = sourceMeta.label;
    badge.setAttribute('aria-label', sourceMeta.label);
    badge.appendChild(icon(sourceMeta.iconClass));
    return badge;
}

function buildBackgroundRelatedEntry(entry) {
    const entryBlock = el('div', 'tv-feed-expand-retrieved');
    const header = el('div', 'tv-feed-expand-entry-header');
    const title = entry?.title || `UID ${entry?.uid ?? '?'}`;
    header.appendChild(el('span', 'tv-feed-expand-entry-title', title));

    if (entry?.lorebook) {
        header.appendChild(el('span', 'tv-feed-expand-entry-book', entry.lorebook));
    }

    entryBlock.appendChild(header);

    const metaParts = [];
    if (Number.isFinite(entry?.uid)) metaParts.push(`UID ${entry.uid}`);
    if (typeof entry?.score === 'number') metaParts.push(`score ${entry.score.toFixed(1)}`);
    if (entry?.tier) metaParts.push(String(entry.tier));
    if (metaParts.length > 0) {
        entryBlock.appendChild(el('div', 'tv-feed-detail-line', metaParts.join(' · ')));
    }

    if (Array.isArray(entry?.keys) && entry.keys.length > 0) {
        const keysRow = el('div', 'tv-float-item-keys');
        const shown = entry.keys.slice(0, 4);
        for (const key of shown) {
            keysRow.appendChild(el('span', 'tv-float-key-tag', key));
        }
        if (entry.keys.length > 4) {
            keysRow.appendChild(el('span', 'tv-float-key-more', `+${entry.keys.length - 4}`));
        }
        entryBlock.appendChild(keysRow);
    }

    if (entry?.summary) {
        entryBlock.appendChild(el('div', 'tv-feed-detail-line', entry.summary));
    }

    return entryBlock;
}

let _renderStatsBar = () => document.createDocumentFragment();
let _saveFeed = () => {};
let _renderAllItems = () => {};
let _openTreeEditorFromFeed = () => {};

/**
 * Register callbacks from activity-feed.js to avoid circular imports.
 */
export function registerFeedRenderCallbacks({
    renderStatsBar,
    saveFeed,
    renderAllItems,
    openTreeEditorFromFeed,
}) {
    if (renderStatsBar) _renderStatsBar = renderStatsBar;
    if (saveFeed) _saveFeed = saveFeed;
    if (renderAllItems) _renderAllItems = renderAllItems;
    if (openTreeEditorFromFeed) _openTreeEditorFromFeed = openTreeEditorFromFeed;
}

export function renderEmptyState(tab = 'all') {
    const panelBody = getPanelBody();
    if (!panelBody) return;
    panelBody.replaceChildren();

    const empty = el('div', 'tv-float-empty');
    empty.appendChild(icon('fa-satellite-dish'));

    let message = 'No activity yet';
    let subMessage = 'Tool calls and lorebook retrievals will appear here';

    if (tab === 'wi') {
        message = 'No entries yet';
        subMessage = 'Native activations and TunnelVision retrievals will appear here';
    } else if (tab === 'tools') {
        message = 'No tool calls yet';
        subMessage = 'TunnelVision tool usage will appear here';
    } else if (tab === 'bg') {
        message = 'No background agent activity';
        subMessage = 'Background processing and deferred actions will appear here';
    }

    empty.appendChild(el('span', null, message));
    empty.appendChild(el('span', 'tv-float-empty-sub', subMessage));
    panelBody.appendChild(empty);
}

export function renderAllItems() {
    const panelBody = getPanelBody();
    if (!panelBody) return;
    const tab = getActiveTab();
    const feedItems = getFeedItemsRaw();

    panelBody.replaceChildren();

    if (tab === 'all' && feedItems.length > 0) {
        panelBody.appendChild(_renderStatsBar());
    }

    const activeTasks = getActiveTasks();
    const failedTasks = getFailedTasks();
    const showActiveTasks = (tab === 'all' || tab === 'bg') && activeTasks.size > 0;
    const showFailedTasks = (tab === 'all' || tab === 'bg') && failedTasks.size > 0;

    if (showActiveTasks) {
        for (const task of activeTasks.values()) {
            panelBody.appendChild(buildActiveTaskElement(task));
        }
    }

    if (showFailedTasks) {
        for (const task of failedTasks.values()) {
            panelBody.appendChild(buildFailedTaskElement(task));
        }
    }

    const filtered = feedItems.filter(item => {
        if (tab === 'all') return true;
        if (tab === 'wi') return item.type === 'entry' || item.type === 'wi';
        if (tab === 'tools') return item.type === 'tool';
        if (tab === 'bg') return item.type === 'background';
        return true;
    });

    if (filtered.length === 0 && !showActiveTasks && !showFailedTasks) {
        renderEmptyState(tab);
        return;
    }

    for (const item of filtered) {
        panelBody.appendChild(buildItemElement(item));
    }
}

export function buildActiveTaskElement(task) {
    const row = el('div', 'tv-float-item tv-active-task');

    const iconWrap = el('div', 'tv-float-item-icon');
    iconWrap.style.color = task.color;
    const spinner = document.createElement('i');
    spinner.className = task.cancelled
        ? `fa-solid ${task.icon} tv-active-task-fading`
        : `fa-solid ${task.icon} fa-spin`;
    iconWrap.appendChild(spinner);
    row.appendChild(iconWrap);

    const body = el('div', 'tv-float-item-body');
    const textRow = el('div', 'tv-float-item-row');
    const verb = el('span', 'tv-float-item-verb', task.label);
    verb.style.color = task.color;
    textRow.appendChild(verb);

    const statusText = task.cancelled ? 'Cancelling...' : 'Running...';
    textRow.appendChild(el('span', 'tv-float-item-summary', statusText));
    body.appendChild(textRow);
    row.appendChild(body);

    if (!task.cancelled) {
        const cancelBtn = el('button', 'tv-active-task-cancel');
        cancelBtn.title = 'Cancel';
        cancelBtn.appendChild(icon('fa-xmark'));
        cancelBtn.addEventListener('click', () => cancelBackgroundTask(task.id));
        row.appendChild(cancelBtn);
    }

    return row;
}

export function buildFailedTaskElement(task) {
    const row = el('div', 'tv-float-item tv-failed-task');

    const iconWrap = el('div', 'tv-float-item-icon');
    iconWrap.style.color = '#d63031';
    iconWrap.appendChild(icon('fa-triangle-exclamation'));
    row.appendChild(iconWrap);

    const body = el('div', 'tv-float-item-body');
    const textRow = el('div', 'tv-float-item-row');
    const verb = el('span', 'tv-float-item-verb', `${task.label} failed`);
    verb.style.color = '#d63031';
    textRow.appendChild(verb);
    textRow.appendChild(el('span', 'tv-float-item-summary', task.errorMessage));
    body.appendChild(textRow);
    row.appendChild(body);

    const btnGroup = el('div', 'tv-feed-expand-actions');
    btnGroup.style.cssText = 'display:flex;gap:4px;align-items:center;flex-shrink:0;';

    const retryBtn = el('button', 'tv-failed-task-retry');
    if (task.retrying) {
        retryBtn.appendChild(icon('fa-spinner fa-spin'));
        retryBtn.append(' Retrying…');
        retryBtn.disabled = true;
    } else {
        retryBtn.appendChild(icon('fa-rotate-right'));
        retryBtn.append(' Retry');
        retryBtn.addEventListener('click', async () => {
            retryBtn.disabled = true;
            retryBtn.replaceChildren(icon('fa-spinner fa-spin'));
            retryBtn.append(' Retrying…');
            const success = await retryFailedTask(task.id);
            if (success) {
                retryBtn.replaceChildren(icon('fa-check'));
                retryBtn.append(' Done');
                retryBtn.classList.add('tv-retry-success');
            }
        });
    }
    btnGroup.appendChild(retryBtn);

    const dismissBtn = el('button', 'tv-failed-task-retry');
    dismissBtn.title = 'Dismiss';
    dismissBtn.appendChild(icon('fa-xmark'));
    dismissBtn.addEventListener('click', () => dismissFailedTask(task.id));
    btnGroup.appendChild(dismissBtn);

    row.appendChild(btnGroup);
    return row;
}

export function buildItemElement(item) {
    const rowClasses = ['tv-float-item'];
    if (item.type === 'entry') {
        rowClasses.push('tv-float-item-entry');
        if (item.source === 'native') {
            rowClasses.push('tv-float-item-entry-native');
        } else if (item.source === 'world-state') {
            rowClasses.push('tv-float-item-entry-native', 'tv-float-item-entry-world-state');
        } else if (item.source === 'post-turn') {
            rowClasses.push('tv-float-item-entry-native', 'tv-float-item-entry-post-turn');
        } else {
            rowClasses.push('tv-float-item-entry-tv');
        }
    } else if (item.type === 'background' && item.preWarmSource) {
        rowClasses.push('tv-float-item-prewarm');
        if (item.preWarmSource === 'fact-driven') {
            rowClasses.push('tv-float-item-prewarm-fact');
        } else {
            rowClasses.push('tv-float-item-prewarm-smart-context');
        }
    } else if (item.type === 'wi') {
        rowClasses.push('tv-float-item-wi');
    }
    if (item.completedAt) rowClasses.push('tv-float-item--completed');
    if (item.dismissedAt) rowClasses.push('tv-float-item--dismissed');

    const row = el('div', rowClasses.join(' '));

    const iconWrap = el('div', 'tv-float-item-icon');
    iconWrap.style.color = item.color;
    iconWrap.appendChild(icon(item.icon));
    if (item.completedAt) {
        const badge = el('span', 'tv-float-item-badge');
        badge.appendChild(icon('fa-check'));
        iconWrap.appendChild(badge);
    }
    row.appendChild(iconWrap);

    const body = el('div', 'tv-float-item-body');
    const textRow = el('div', 'tv-float-item-row');
    const verb = el('span', 'tv-float-item-verb', item.verb);
    verb.style.color = item.color;
    textRow.appendChild(verb);

    const summaryText = item.type === 'entry'
        ? formatEntrySummary(item, shouldIncludeLorebookForEntries())
        : (item.summary || '');
    textRow.appendChild(el('span', 'tv-float-item-summary', summaryText));
    if (item.type === 'entry') {
        const sourceIcon = buildEntrySourceIcon(item.source);
        if (sourceIcon) textRow.appendChild(sourceIcon);
    }
    body.appendChild(textRow);

    if (item.keys?.length > 0) {
        const keysRow = el('div', 'tv-float-item-keys');
        const shown = item.keys.slice(0, 4);
        for (const k of shown) {
            keysRow.appendChild(el('span', 'tv-float-key-tag', k));
        }
        if (item.keys.length > 4) {
            keysRow.appendChild(el('span', 'tv-float-key-more', `+${item.keys.length - 4}`));
        }
        body.appendChild(keysRow);
    }

    if (item.type === 'background' && item.details?.length) {
        const detailsRow = el('div', 'tv-float-item-keys');
        for (const detail of item.details) {
            detailsRow.appendChild(el('span', 'tv-float-key-tag tv-float-bg-detail', detail));
        }
        body.appendChild(detailsRow);
    }

    if (item.type === 'tool' && item.retrievedEntries?.length) {
        const entriesRow = el('div', 'tv-float-item-entries');
        const uniqueBooks = new Set(item.retrievedEntries.map(entry => entry.lorebook).filter(Boolean));
        const includeLorebook = uniqueBooks.size > 1;
        const shown = item.retrievedEntries.slice(0, MAX_RENDERED_RETRIEVED_ENTRIES);

        for (const entry of shown) {
            const chip = el('div', 'tv-float-entry-tag', formatRetrievedEntryLabel(entry, includeLorebook));
            chip.title = `${entry.lorebook || 'Lorebook'} |UID ${entry.uid ?? '?'}${entry.title ? ` | ${entry.title}` : ''}`;
            entriesRow.appendChild(chip);
        }

        if (item.retrievedEntries.length > MAX_RENDERED_RETRIEVED_ENTRIES) {
            const remaining = item.retrievedEntries.length - MAX_RENDERED_RETRIEVED_ENTRIES;
            entriesRow.appendChild(
                el('div', 'tv-float-entry-more', `+${remaining} more retrieved entr${remaining === 1 ? 'y' : 'ies'}`),
            );
        }

        body.appendChild(entriesRow);
    }

    row.appendChild(body);
    row.appendChild(el('div', 'tv-float-item-time', formatTime(item.timestamp)));

    if (item.type === 'entry' && item.lorebook && item.uid != null) {
        row.classList.add('tv-feed-clickable');
        row.addEventListener('click', () => toggleFeedEntryExpand(row, item));
    }

    if (item.type === 'tool' && item.retrievedEntries?.length) {
        row.classList.add('tv-feed-clickable');
        row.addEventListener('click', () => toggleToolItemExpand(row, item));
    }

    if (item.type === 'background' && (item.action || item.relatedEntries?.length || item.details?.length)) {
        row.classList.add('tv-feed-clickable');
        row.addEventListener('click', () => toggleBackgroundExpand(row, item));
    } else if (item.type === 'entry' && item.lorebook && item.uid != null) {
        row.classList.add('tv-feed-clickable');
        row.addEventListener('click', () => toggleFeedEntryExpand(row, item));
    } else if (item.type === 'entry' && item.source && item.source !== 'native') {
        const sourceLabel = item.source === 'smart-context'
            ? 'Source: Smart Context'
            : `Source: ${item.source}`;
        const details = el('div', 'tv-feed-details');
        details.style.display = 'none';
        details.appendChild(el('div', 'tv-feed-detail-line', sourceLabel));
        row.appendChild(details);

        row.classList.add('tv-feed-clickable');
        row.addEventListener('click', () => {
            details.style.display = details.style.display === 'none' ? 'block' : 'none';
        });
    }

    return row;
}

export async function toggleFeedEntryExpand(row, item) {
    const expandEl = row.nextElementSibling;
    if (expandEl?.classList.contains('tv-feed-expand')) {
        expandEl.remove();
        row.classList.remove('expanded');
        return;
    }

    row.classList.add('expanded');
    const expandDiv = el('div', 'tv-feed-expand');
    expandDiv.textContent = 'Loading…';
    row.after(expandDiv);

    try {
        const result = await findEntry(item.lorebook, item.uid);
        if (!row.classList.contains('expanded')) return;
        expandDiv.replaceChildren();

        if (!result?.entry) {
            expandDiv.appendChild(el('div', 'tv-feed-expand-empty', 'Entry not found or deleted'));
            return;
        }

        const entry = result.entry;
        const contentDiv = el('div', 'tv-feed-expand-content');
        contentDiv.textContent = entry.content || '(empty)';
        expandDiv.appendChild(contentDiv);

        const actions = el('div', 'tv-feed-expand-actions');

        const openBtn = el('button', 'tv-btn tv-btn-sm tv-btn-secondary');
        openBtn.appendChild(icon('fa-folder-tree'));
        openBtn.append(' Open in Tree');
        openBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openTreeEditorForBook(item.lorebook);
        });
        actions.appendChild(openBtn);

        const copyBtn = el('button', 'tv-btn tv-btn-sm tv-btn-secondary');
        copyBtn.appendChild(icon('fa-copy'));
        copyBtn.append(' Copy');
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(entry.content || '');
            copyBtn.replaceChildren(icon('fa-check'));
            copyBtn.append(' Copied');
            setTimeout(() => {
                copyBtn.replaceChildren(icon('fa-copy'));
                copyBtn.append(' Copy');
            }, 1500);
        });
        actions.appendChild(copyBtn);

        const versions = getEntryVersions(item.lorebook, item.uid);
        if (versions.length > 0) {
            const histBtn = el('button', 'tv-btn tv-btn-sm tv-btn-secondary');
            histBtn.appendChild(icon('fa-clock-rotate-left'));
            histBtn.append(` History (${versions.length})`);
            histBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const existing = expandDiv.querySelector('.tv-version-history');
                if (existing) {
                    existing.remove();
                    return;
                }
                expandDiv.appendChild(buildVersionHistoryPanel(versions, entry.content));
            });
            actions.appendChild(histBtn);
        }

        expandDiv.appendChild(actions);
    } catch (err) {
        expandDiv.replaceChildren(el('div', 'tv-feed-expand-empty', `Failed to load: ${err.message}`));
    }
}

export async function toggleToolItemExpand(row, item) {
    const expandEl = row.nextElementSibling;
    if (expandEl?.classList.contains('tv-feed-expand')) {
        expandEl.remove();
        row.classList.remove('expanded');
        return;
    }

    row.classList.add('expanded');
    const expandDiv = el('div', 'tv-feed-expand tv-feed-expand-tool');
    expandDiv.textContent = 'Loading…';
    row.after(expandDiv);

    try {
        expandDiv.replaceChildren();

        for (const re of item.retrievedEntries.slice(0, MAX_RENDERED_RETRIEVED_ENTRIES)) {
            const entryBlock = el('div', 'tv-feed-expand-retrieved');
            const header = el('div', 'tv-feed-expand-entry-header');
            const titleSpan = el('span', 'tv-feed-expand-entry-title', re.title || `UID ${re.uid ?? '?'}`);
            header.appendChild(titleSpan);
            if (re.lorebook) {
                header.appendChild(el('span', 'tv-feed-expand-entry-book', re.lorebook));
            }
            entryBlock.appendChild(header);

            try {
                const result = await findEntry(re.lorebook, re.uid);
                if (result?.entry) {
                    const contentDiv = el('div', 'tv-feed-expand-content');
                    contentDiv.textContent = result.entry.content || '(empty)';
                    entryBlock.appendChild(contentDiv);
                } else {
                    entryBlock.appendChild(el('div', 'tv-feed-expand-empty', 'Entry not found'));
                }
            } catch {
                entryBlock.appendChild(el('div', 'tv-feed-expand-empty', 'Could not load entry'));
            }

            expandDiv.appendChild(entryBlock);
        }

        if (item.retrievedEntries.length > MAX_RENDERED_RETRIEVED_ENTRIES) {
            const remaining = item.retrievedEntries.length - MAX_RENDERED_RETRIEVED_ENTRIES;
            expandDiv.appendChild(el('div', 'tv-feed-expand-empty', `+${remaining} more not shown`));
        }
    } catch {
        expandDiv.replaceChildren(el('div', 'tv-feed-expand-empty', 'Failed to load entries'));
    }
}

export function toggleBackgroundExpand(row, item) {
    const expandEl = row.nextElementSibling;
    if (expandEl?.classList.contains('tv-feed-expand')) {
        expandEl.remove();
        row.classList.remove('expanded');
        return;
    }

    row.classList.add('expanded');
    const expandDiv = el('div', 'tv-feed-expand tv-feed-expand-bg');
    const actionsDiv = el('div', 'tv-feed-expand-actions');

    if (Array.isArray(item.relatedEntries) && item.relatedEntries.length > 0) {
        for (const entry of item.relatedEntries) {
            expandDiv.appendChild(buildBackgroundRelatedEntry(entry));
        }
    } else if (Array.isArray(item.details) && item.details.length > 0) {
        for (const detail of item.details) {
            expandDiv.appendChild(el('div', 'tv-feed-detail-line', detail));
        }
    }

    if (item.completedAt) {
        const doneLabel = el('span', 'tv-feed-completed-label');
        doneLabel.appendChild(icon('fa-circle-check'));
        doneLabel.append(' Completed');
        actionsDiv.appendChild(doneLabel);
    } else if (item.dismissedAt) {
        const undoBtn = el('button', 'tv-btn tv-btn-sm tv-btn-secondary');
        undoBtn.appendChild(icon('fa-rotate-left'));
        undoBtn.append(' Undo dismiss');
        undoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            delete item.dismissedAt;
            _saveFeed();
            _renderAllItems();
        });
        actionsDiv.appendChild(undoBtn);
    } else if (item.action) {
        const actionBtn = el('button', 'tv-btn tv-btn-sm tv-btn-secondary');
        actionBtn.appendChild(icon(item.action.icon || 'fa-arrow-right'));
        actionBtn.append(` ${item.action.label}`);
        actionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleBackgroundAction(item.action, actionBtn, item);
        });
        actionsDiv.appendChild(actionBtn);

        const dismissBtn = el('button', 'tv-btn tv-btn-sm tv-btn-secondary tv-btn-dismiss');
        dismissBtn.appendChild(icon('fa-xmark'));
        dismissBtn.append(' Dismiss');
        dismissBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            item.dismissedAt = Date.now();
            _saveFeed();
            _renderAllItems();
        });
        actionsDiv.appendChild(dismissBtn);
    }

    if (actionsDiv.childNodes.length > 0) {
        expandDiv.appendChild(actionsDiv);
    }
    row.after(expandDiv);
}

export async function handleBackgroundAction(action, btn, item) {
    switch (action.type) {
        case 'create-tracker':
            await handleCreateTrackerAction(action, btn, item);
            break;
        case 'open-tree-editor':
            _openTreeEditorFromFeed();
            break;
    }
}

export async function handleCreateTrackerAction(action, btn, item) {
    if (!action.characterName) return;
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.replaceChildren(icon('fa-spinner fa-spin'));
    btn.append(' Creating…');

    try {
        const result = await createTrackerForCharacter(action.characterName);
        btn.replaceChildren(icon('fa-check'));
        btn.append(` Created (UID ${result.uid})`);
        btn.classList.add('tv-btn-success');

        if (item) {
            item.completedAt = Date.now();
            _saveFeed();
        }

        setLorebookStatsCache(null);

        addBackgroundEvent({
            icon: 'fa-address-card',
            verb: 'Tracker created',
            color: '#00b894',
            summary: `"${result.comment}" in ${result.bookName} → ${result.nodeLabel}`,
            details: [`UID ${result.uid}`, result.bookName],
        });
    } catch (err) {
        btn.replaceChildren(icon('fa-triangle-exclamation'));
        btn.append(` Failed: ${err.message}`);
        btn.classList.add('tv-btn-error');
        btn.disabled = false;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            btn.innerHTML = originalHtml;
            btn.classList.remove('tv-btn-error');
            handleCreateTrackerAction(action, btn, item);
        }, { once: true });
    }
}

export function refreshActiveTasksInPanel() {
    if (!getPanelEl()?.classList.contains('open')) return;
    if (getShowingWorldState() || getShowingTimeline() || getShowingArcs()) return;
    _renderAllItems();
}