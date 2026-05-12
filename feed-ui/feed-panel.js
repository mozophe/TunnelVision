/**
 * TunnelVision Activity Feed — Floating Panel UI
 *
 * Responsible for:
 * - creating the draggable trigger button
 * - creating the floating panel shell
 * - restoring/persisting trigger position
 * - restoring/persisting panel size
 * - positioning the panel near the trigger
 *
 * This module intentionally owns only shell/UI concerns.
 * Feed rendering and view switching remain in activity-feed.js / feed-views.js.
 */

import { getTree } from '../tree-store.js';
import { getActiveTunnelVisionBooks } from '../tool-registry.js';
import { openTreeEditorForBook } from '../ui-controller.js';
import {
    getTriggerEl, setTriggerEl,
    getPanelEl, setPanelEl,
    getPanelBody, setPanelBody,
    getPanelTabs, setPanelTabs,
} from '../feed-state.js';

// ── Storage keys ─────────────────────────────────────────────────

export const STORAGE_KEY_POS = 'tv-feed-trigger-position';
export const STORAGE_KEY_SIZE = 'tv-feed-panel-size';
export const STORAGE_KEY_PANEL_POS = 'tv-feed-panel-position';

// ── Local DOM helpers ────────────────────────────────────────────

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

// ── Tree editor shortcut ─────────────────────────────────────────

/**
 * Open the tree editor for an active TV lorebook.
 * Single book → opens directly. Multiple → shows a quick picker dropdown.
 */
export function openTreeEditorFromFeed() {
    const books = getActiveTunnelVisionBooks().filter(b => {
        const tree = getTree(b);
        return tree && tree.root;
    });

    if (books.length === 0) {
        toastr.info('No lorebooks with built trees. Build a tree first in TunnelVision settings.', 'TunnelVision');
        return;
    }

    if (books.length === 1) {
        openTreeEditorForBook(books[0]);
        return;
    }

    const panelEl = getPanelEl();
    const picker = el('div', 'tv-book-picker');
    const label = el('div', 'tv-book-picker-label');
    label.textContent = 'Choose lorebook:';
    picker.appendChild(label);

    for (const name of books) {
        const btn = el('button', 'tv-book-picker-btn');
        btn.textContent = name;
        btn.addEventListener('click', () => {
            picker.remove();
            openTreeEditorForBook(name);
        });
        picker.appendChild(btn);
    }

    const panelHeader = panelEl?.querySelector('.tv-float-panel-header');
    if (panelHeader) {
        panelHeader.appendChild(picker);
        const dismiss = (e) => {
            if (!picker.contains(e.target)) {
                picker.remove();
                document.removeEventListener('click', dismiss, true);
            }
        };
        setTimeout(() => document.addEventListener('click', dismiss, true), 0);
    }
}

// ── Trigger button ───────────────────────────────────────────────

export function createTriggerButton({ onTogglePanel }) {
    const triggerEl = el('div', 'tv-float-trigger');
    setTriggerEl(triggerEl);
    triggerEl.title = 'TunnelVision Activity Feed';
    triggerEl.setAttribute('data-tv-count', '0');
    triggerEl.appendChild(icon('fa-satellite-dish'));

    // Restore saved position
    const saved = localStorage.getItem(STORAGE_KEY_POS);
    if (saved) {
        try {
            const pos = JSON.parse(saved);
            triggerEl.style.left = pos.left;
            triggerEl.style.top = pos.top;
            triggerEl.style.bottom = 'auto';
            triggerEl.style.right = 'auto';
        } catch {
            /* use default CSS position */
        }
    }

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    triggerEl.addEventListener('pointerdown', (e) => {
        dragging = false;
        offsetX = e.clientX - triggerEl.getBoundingClientRect().left;
        offsetY = e.clientY - triggerEl.getBoundingClientRect().top;
        triggerEl.setPointerCapture(e.pointerId);
    });

    triggerEl.addEventListener('pointermove', (e) => {
        if (!triggerEl.hasPointerCapture(e.pointerId)) return;

        const dx = e.clientX - triggerEl.getBoundingClientRect().left - offsetX;
        const dy = e.clientY - triggerEl.getBoundingClientRect().top - offsetY;

        if (!dragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
            dragging = true;
        }

        if (!dragging) return;

        const x = Math.max(0, Math.min(window.innerWidth - 40, e.clientX - offsetX));
        const y = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - offsetY));
        triggerEl.style.left = `${x}px`;
        triggerEl.style.top = `${y}px`;
        triggerEl.style.bottom = 'auto';
        triggerEl.style.right = 'auto';
    });

    triggerEl.addEventListener('pointerup', (e) => {
        triggerEl.releasePointerCapture(e.pointerId);

        if (dragging) {
            localStorage.setItem(STORAGE_KEY_POS, JSON.stringify({
                left: triggerEl.style.left,
                top: triggerEl.style.top,
            }));
            dragging = false;
            return;
        }

        onTogglePanel?.();
    });

    document.body.appendChild(triggerEl);
    return triggerEl;
}

// ── Panel shell ──────────────────────────────────────────────────

export function createPanel({
    onToggleTimelineView,
    onToggleArcsView,
    onToggleHealthView,
    onToggleWorldStateView,
    onClearFeed,
    onRenderAllItems,
}) {
    const panelEl = el('div', 'tv-float-panel');
    setPanelEl(panelEl);

    // Restore saved size
    const savedSize = localStorage.getItem(STORAGE_KEY_SIZE);
    if (savedSize) {
        try {
            const size = JSON.parse(savedSize);
            if (size && typeof size.width === 'string') panelEl.style.width = size.width;
            if (size && typeof size.height === 'string') panelEl.style.height = size.height;
        } catch {
            /* ignore invalid saved size */
        }
    }

    // Restore saved panel position
    const savedPanelPos = localStorage.getItem(STORAGE_KEY_PANEL_POS);
    if (savedPanelPos) {
        try {
            const pos = JSON.parse(savedPanelPos);
            if (pos && typeof pos.left === 'string') panelEl.style.left = pos.left;
            if (pos && typeof pos.top === 'string') panelEl.style.top = pos.top;
            panelEl.dataset.dragPinned = 'true';
        } catch {
            /* ignore invalid saved position */
        }
    }

    // Persist size after resize interaction
    const persistSize = () => {
        const w = panelEl.style.width;
        const h = panelEl.style.height;
        if (!w && !h) return;
        localStorage.setItem(STORAGE_KEY_SIZE, JSON.stringify({ width: w, height: h }));
    };
    panelEl.addEventListener('pointerup', persistSize);
    panelEl.addEventListener('mouseup', persistSize);
    panelEl.addEventListener('touchend', persistSize);

    // Header
    const header = el('div', 'tv-float-panel-header');
    header.style.cursor = 'move';

    // Drag behavior (panel follows pointer while dragging header)
    let draggingPanel = false;
    let panelOffsetX = 0;
    let panelOffsetY = 0;

    const persistPanelPosition = () => {
        const left = panelEl.style.left;
        const top = panelEl.style.top;
        if (!left || !top) return;
        localStorage.setItem(STORAGE_KEY_PANEL_POS, JSON.stringify({ left, top }));
    };

    header.addEventListener('pointerdown', (e) => {
        // Only start drag from header background (avoid hijacking button clicks)
        if (e.target instanceof HTMLElement && e.target.closest('button')) return;

        draggingPanel = false;
        const rect = panelEl.getBoundingClientRect();
        panelOffsetX = e.clientX - rect.left;
        panelOffsetY = e.clientY - rect.top;
        header.setPointerCapture(e.pointerId);
    });

    header.addEventListener('pointermove', (e) => {
        if (!header.hasPointerCapture(e.pointerId)) return;

        const rect = panelEl.getBoundingClientRect();
        const dx = e.clientX - rect.left - panelOffsetX;
        const dy = e.clientY - rect.top - panelOffsetY;

        if (!draggingPanel && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
            draggingPanel = true;
        }

        if (!draggingPanel) return;

        const panelRect = panelEl.getBoundingClientRect();
        const maxLeft = Math.max(0, window.innerWidth - panelRect.width);
        const maxTop = Math.max(0, window.innerHeight - panelRect.height);

        const x = Math.max(0, Math.min(maxLeft, e.clientX - panelOffsetX));
        const y = Math.max(0, Math.min(maxTop, e.clientY - panelOffsetY));

        panelEl.style.left = `${x}px`;
        panelEl.style.top = `${y}px`;
        panelEl.dataset.dragPinned = 'true';
    });

    header.addEventListener('pointerup', (e) => {
        if (header.hasPointerCapture(e.pointerId)) {
            header.releasePointerCapture(e.pointerId);
        }
        if (draggingPanel) {
            persistPanelPosition();
            draggingPanel = false;
        }
    });

    const title = el('span', 'tv-float-panel-title');
    title.appendChild(icon('fa-satellite-dish'));
    title.append(' TunnelVision Feed');
    header.appendChild(title);

    const timelineBtn = el('button', 'tv-float-panel-btn tv-timeline-btn');
    timelineBtn.title = 'Timeline view';
    timelineBtn.appendChild(icon('fa-clock-rotate-left'));
    timelineBtn.addEventListener('click', onToggleTimelineView);
    header.appendChild(timelineBtn);

    const arcsBtn = el('button', 'tv-float-panel-btn tv-arcs-btn');
    arcsBtn.title = 'Narrative arcs';
    arcsBtn.appendChild(icon('fa-diagram-project'));
    arcsBtn.addEventListener('click', onToggleArcsView);
    header.appendChild(arcsBtn);

    const healthBtn = el('button', 'tv-float-panel-btn tv-health-btn');
    healthBtn.title = 'Lorebook health dashboard';
    healthBtn.appendChild(icon('fa-heart-pulse'));
    healthBtn.addEventListener('click', onToggleHealthView);
    header.appendChild(healthBtn);

    const worldStateBtn = el('button', 'tv-float-panel-btn tv-ws-btn');
    worldStateBtn.title = 'View/edit world state';
    worldStateBtn.appendChild(icon('fa-globe'));
    worldStateBtn.addEventListener('click', onToggleWorldStateView);
    header.appendChild(worldStateBtn);

    const settingsBtn = el('button', 'tv-float-panel-btn');
    settingsBtn.title = 'Open tree editor';
    settingsBtn.appendChild(icon('fa-folder-tree'));
    settingsBtn.addEventListener('click', openTreeEditorFromFeed);
    header.appendChild(settingsBtn);

    const clearBtn = el('button', 'tv-float-panel-btn');
    clearBtn.title = 'Clear feed';
    clearBtn.appendChild(icon('fa-trash-can'));
    clearBtn.addEventListener('click', () => onClearFeed?.());
    header.appendChild(clearBtn);

    const closeBtn = el('button', 'tv-float-panel-btn');
    closeBtn.title = 'Close';
    closeBtn.appendChild(icon('fa-xmark'));
    closeBtn.addEventListener('click', () => {
        panelEl.classList.remove('open');
    });
    header.appendChild(closeBtn);

    panelEl.appendChild(header);

    // Tabs
    const panelTabs = el('div', 'tv-float-panel-tabs');
    setPanelTabs(panelTabs);

    for (const [key, label] of [['all', 'All'], ['wi', 'Entries'], ['tools', 'Tools'], ['bg', 'Agent']]) {
        const tab = el('button', `tv-float-tab${key === 'all' ? ' active' : ''}`, label);
        tab.dataset.tab = key;
        tab.addEventListener('click', () => {
            panelTabs.querySelectorAll('.tv-float-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            onRenderAllItems?.();
        });
        panelTabs.appendChild(tab);
    }

    panelEl.appendChild(panelTabs);

    // Body
    const panelBody = el('div', 'tv-float-panel-body');
    setPanelBody(panelBody);
    panelEl.appendChild(panelBody);

    document.body.appendChild(panelEl);
    return panelEl;
}

// ── Positioning helpers ──────────────────────────────────────────

export function positionPanel() {
    const triggerEl = getTriggerEl();
    const panelEl = getPanelEl();
    if (!triggerEl || !panelEl) return;

    // If user has manually dragged the panel, preserve that position.
    if (panelEl.dataset.dragPinned === 'true') {
        const left = parseFloat(panelEl.style.left || '');
        const top = parseFloat(panelEl.style.top || '');
        const pw = panelEl.offsetWidth || parseFloat(panelEl.style.width || '') || 340;
        const ph = panelEl.offsetHeight || parseFloat(panelEl.style.height || '') || 420;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const clampedLeft = Number.isFinite(left) ? Math.max(0, Math.min(vw - pw, left)) : 16;
        const clampedTop = Number.isFinite(top) ? Math.max(0, Math.min(vh - ph, top)) : 16;

        panelEl.style.left = `${clampedLeft}px`;
        panelEl.style.top = `${clampedTop}px`;
        return;
    }

    const rect = triggerEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let pw = 0;
    let ph = 0;

    if (panelEl.classList.contains('open') && panelEl.offsetWidth && panelEl.offsetHeight) {
        pw = panelEl.offsetWidth;
        ph = panelEl.offsetHeight;
    } else {
        const w = parseFloat(panelEl.style.width || '');
        const h = parseFloat(panelEl.style.height || '');
        pw = Number.isFinite(w) && w > 0 ? w : 340;
        ph = Number.isFinite(h) && h > 0 ? h : 420;
    }

    let left = rect.right + 8;
    if (left + pw > vw - 16) left = rect.left - pw - 8;
    if (left < 16) left = 16;

    let top = rect.top;
    if (top + ph > vh - 16) top = vh - ph - 16;
    if (top < 16) top = 16;

    panelEl.style.left = `${left}px`;
    panelEl.style.top = `${top}px`;
}

export function getActiveTab() {
    return getPanelTabs()?.querySelector('.tv-float-tab.active')?.dataset.tab || 'all';
}