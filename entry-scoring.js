/**
 * TunnelVision Entry Quality Scoring
 *
 * Computes a quality/health score per lorebook entry based on heuristics:
 *   - Specificity: Content length and presence of concrete details
 *   - Freshness: How recently the entry was created (UID as proxy)
 *   - Retrieval rate: How often smart context selects and the AI references it
 *   - Key coverage: Whether the entry's keys appear in recent chat
 *
 * All computed locally from cached data — no LLM calls.
 * Surfaced as color-coded health dots in the tree editor.
 */

import { getFeedbackMap } from './smart-context.js';
import {SPECIFICITY_THRESHOLDS, SPECIFICITY_DEFAULT_SCORE,
    QUALITY_RATING_GOOD, QUALITY_RATING_FAIR, QUALITY_RATING_STALE,
    HEALTH_DUPLICATE_CANDIDATE_THRESHOLD, HEALTH_DUPLICATE_DENSITY_THRESHOLD,
    HEALTH_MAX_DUPLICATE_SCAN_ENTRIES, HEALTH_OUTLIER_LENGTH_FLOOR,
} from './constants.js';
import { getContext } from '../../../st-context.js';
import { isSummaryTitle, isTrackerTitle, getTree, getAllEntryUids } from './tree-store.js';
import { trigramSimilarity } from './agent-utils.js';

const PROPER_NOUN_RE = /[A-Z][a-z]{2,}/g;
const NUMBER_RE = /\d+/g;

/**
 * Compute a quality score for a single lorebook entry.
 * @param {Object} entry - The lorebook entry object
 * @param {number} maxUid - Highest UID in the lorebook (for freshness calculation)
 * @param {Record<string, Object>|null} feedbackData - Feedback map from smart-context
 * @param {string} recentText - Lowercased recent chat text for key coverage
 * @returns {{ specificity: number, freshness: number, retrievalRate: number, keyCoverage: number, total: number }}
 */
export function computeEntryQuality(entry, maxUid, feedbackData, recentText) {
    const quality = { specificity: 0, freshness: 0, retrievalRate: 0, keyCoverage: 0, total: 0 };
    if (!entry) return quality;

    // ── Specificity (0-25) ──
    const content = (entry.content || '').trim();
    const contentLen = content.length;
    quality.specificity = SPECIFICITY_DEFAULT_SCORE;
    for (const { minChars, score } of SPECIFICITY_THRESHOLDS) {
        if (contentLen >= minChars) { quality.specificity = score; break; }
    }

    const properNouns = (content.match(PROPER_NOUN_RE) || []).length;
    const numbers = (content.match(NUMBER_RE) || []).length;
    if (properNouns >= 3 || numbers >= 2) {
        quality.specificity = Math.min(25, quality.specificity + 5);
    }

    // ── Freshness (0-25) ──
    if (maxUid > 0 && entry.uid != null) {
        const ratio = entry.uid / maxUid;
        if (ratio > 0.9) quality.freshness = 25;
        else if (ratio > 0.7) quality.freshness = 20;
        else if (ratio > 0.5) quality.freshness = 15;
        else if (ratio > 0.3) quality.freshness = 10;
        else quality.freshness = 5;
    } else {
        quality.freshness = 15;
    }

    // ── Retrieval Rate (0-25) ──
    const fb = feedbackData?.[entry.uid];
    if (fb && fb.injections > 0) {
        const ratio = fb.references / fb.injections;
        if (fb.injections >= 3 && ratio > 0.5) quality.retrievalRate = 25;
        else if (fb.references > 0) quality.retrievalRate = 20;
        else if (fb.injections >= 3 && fb.references === 0) quality.retrievalRate = 5;
        else quality.retrievalRate = 15;
    } else {
        quality.retrievalRate = 10;
    }

    // ── Key Coverage (0-25) ──
    if (recentText) {
        const keys = entry.key || [];
        let matches = 0;
        for (const key of keys) {
            const k = String(key).trim().toLowerCase();
            if (k.length >= 2 && recentText.includes(k)) matches++;
        }
        if (matches >= 3) quality.keyCoverage = 25;
        else if (matches >= 2) quality.keyCoverage = 20;
        else if (matches >= 1) quality.keyCoverage = 15;
        else quality.keyCoverage = 5;
    } else {
        quality.keyCoverage = 10;
    }

    quality.total = quality.specificity + quality.freshness + quality.retrievalRate + quality.keyCoverage;
    return quality;
}

/**
 * Map a total quality score to a categorical rating.
 * @param {number|{total:number}} quality
 * @returns {'good'|'fair'|'stale'|'poor'}
 */
export function getQualityRating(quality) {
    const total = typeof quality === 'number' ? quality : quality.total;
    if (total >= QUALITY_RATING_GOOD) return 'good';
    if (total >= QUALITY_RATING_FAIR) return 'fair';
    if (total >= QUALITY_RATING_STALE) return 'stale';
    return 'poor';
}

/**
 * Get the CSS color for a quality rating.
 * @param {'good'|'fair'|'stale'|'poor'} rating
 * @returns {string}
 */
export function getQualityColor(rating) {
    switch (rating) {
        case 'good': return '#00b894';
        case 'fair': return '#fdcb6e';
        case 'stale': return '#e17055';
        case 'poor': return '#d63031';
        default: return '#636e72';
    }
}

/**
 * Build a human-readable tooltip from a quality breakdown.
 * @param {{ specificity: number, freshness: number, retrievalRate: number, keyCoverage: number, total: number }} q
 * @returns {string}
 */
export function qualityTooltip(q) {
    return [
        `Quality: ${q.total}/100 (${getQualityRating(q)})`,
        `  Specificity: ${q.specificity}/25`,
        `  Freshness: ${q.freshness}/25`,
        `  Retrieval: ${q.retrievalRate}/25`,
        `  Key Coverage: ${q.keyCoverage}/25`,
    ].join('\n');
}

/**
 * Pre-compute quality context for a lorebook: maxUid, feedbackMap, and recentText.
 * Call once per render pass, then pass the result to computeEntryQuality for each entry.
 * @param {Object} bookData - The lorebook's book data (with .entries)
 * @returns {{ maxUid: number, feedbackMap: Record<string, Object>, recentText: string }}
 */
export function buildQualityContext(bookData) {
    let maxUid = 0;
    if (bookData?.entries) {
        for (const key of Object.keys(bookData.entries)) {
            const uid = bookData.entries[key].uid;
            if (uid > maxUid) maxUid = uid;
        }
    }

    const feedbackMap = getFeedbackMap();

    let recentText = '';
    try {
        const chat = getContext().chat;
        if (chat && chat.length > 0) {
            const start = Math.max(0, chat.length - 10);
            const parts = [];
            for (let i = start; i < chat.length; i++) {
                if (!chat[i].is_system && chat[i].mes) parts.push(chat[i].mes);
            }
            recentText = parts.join(' ').toLowerCase();
        }
    } catch { /* no chat */ }

    return { maxUid, feedbackMap, recentText };
}

/**
 * Count stale entries across active lorebooks.
 * An entry is stale if it has been injected 3+ times without being referenced.
 * @param {Object} bookData - Lorebook data
 * @returns {number}
 */
export function countStaleEntries(bookData) {
    if (!bookData?.entries) return 0;
    const feedbackMap = getFeedbackMap();
    let stale = 0;

    for (const key of Object.keys(bookData.entries)) {
        const entry = bookData.entries[key];
        if (entry.disable) continue;
        const title = entry.comment || '';
        if (isSummaryTitle(title) || isTrackerTitle(title)) continue;

        const fb = feedbackMap[entry.uid];
        if (fb && fb.injections >= 3 && fb.references === 0) stale++;
    }

    return stale;
}

// ── Health Dashboard Analysis ────────────────────────────────────

const TIMESTAMP_RE = /^\[([^\]]*Day\s+\d+[^\]]*)\]/i;

/**
 * @typedef {Object} LorebookHealthReport
 * @property {number} totalEntries
 * @property {number} facts
 * @property {number} summaries
 * @property {number} trackers
 * @property {number} disabled
 * @property {{ label: string, count: number }[]} categoryDistribution
 * @property {{ uid: number, title: string, bookName: string }[]} staleEntries
 * @property {{ uid: number, title: string, bookName: string }[]} orphanedEntries
 * @property {{ uid: number, title: string, bookName: string }[]} noTimestamp
 * @property {number} avgLength
 * @property {{ uid: number, title: string, bookName: string, length: number }[]} outlierEntries
 * @property {{ uidA: number, uidB: number, titleA: string, titleB: string, bookName: string, similarity: number }[]} duplicateCandidates
 * @property {number} growthRate - Entries per 100 turns (estimated)
 * @property {number} duplicateDensity - Fraction of entries with >0.7 similarity to another (0-1)
 * @property {number} compressionRatio - Average current length / average initial length (version-based)
 * @property {number} neverReferencedCount - Entries never referenced in last 50 turns
 * @property {{ key: string, size: number }[]} metadataSizes - Size breakdown of metadata stores
 */

/**
 * Build a comprehensive health report for a lorebook.
 * All computed locally — no LLM calls.
 * @param {string} bookName
 * @param {Object} bookData - Lorebook data with .entries
 * @returns {LorebookHealthReport}
 */
export function buildHealthReport(bookName, bookData) {
    const report = {
        totalEntries: 0,
        facts: 0,
        summaries: 0,
        trackers: 0,
        disabled: 0,
        categoryDistribution: [],
        staleEntries: [],
        orphanedEntries: [],
        noTimestamp: [],
        avgLength: 0,
        outlierEntries: [],
        duplicateCandidates: [],
    };

    if (!bookData?.entries) return report;
    const feedbackMap = getFeedbackMap();

    // Category distribution from tree
    const tree = getTree(bookName);
    const treeUids = tree?.root ? new Set(getAllEntryUids(tree.root)) : new Set();

    if (tree?.root) {
        const distMap = new Map();
        buildCategoryDist(tree.root, distMap, bookData.entries, true);
        report.categoryDistribution = [...distMap.entries()]
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count);
    }

    // Iterate all entries
    const factEntries = [];
    let totalLength = 0;

    for (const key of Object.keys(bookData.entries)) {
        const entry = bookData.entries[key];

        if (entry.disable) {
            report.disabled++;
            continue;
        }

        report.totalEntries++;
        const title = entry.comment || '';
        const content = (entry.content || '').trim();
        totalLength += content.length;

        if (isSummaryTitle(title)) {
            report.summaries++;
        } else if (isTrackerTitle(title)) {
            report.trackers++;
        } else {
            report.facts++;
            factEntries.push({ entry, title, content });
        }

        // Stale check
        const fb = feedbackMap[entry.uid];
        if (fb && fb.injections >= 3 && fb.references === 0 && !isSummaryTitle(title) && !isTrackerTitle(title)) {
            report.staleEntries.push({ uid: entry.uid, title: title || `UID ${entry.uid}`, bookName });
        }

        // Orphan check — entry exists in lorebook but not in any tree node
        if (treeUids.size > 0 && !treeUids.has(entry.uid)) {
            report.orphanedEntries.push({ uid: entry.uid, title: title || `UID ${entry.uid}`, bookName });
        }

        // Timestamp check — facts without [Day X] prefix
        if (!isSummaryTitle(title) && !isTrackerTitle(title) && content && !TIMESTAMP_RE.test(content)) {
            report.noTimestamp.push({ uid: entry.uid, title: title || `UID ${entry.uid}`, bookName });
        }
    }

    // Average length and outliers (>3x average or >2000 chars)
    report.avgLength = report.totalEntries > 0 ? Math.round(totalLength / report.totalEntries) : 0;
    const outlierThreshold = Math.max(report.avgLength * 3, HEALTH_OUTLIER_LENGTH_FLOOR);
    for (const { entry, title, content } of factEntries) {
        if (content.length > outlierThreshold) {
            report.outlierEntries.push({
                uid: entry.uid,
                title: title || `UID ${entry.uid}`,
                bookName,
                length: content.length,
            });
        }
    }
    report.outlierEntries.sort((a, b) => b.length - a.length);

    // Duplicate candidates — check trigram similarity between fact entries
    // Cap comparisons to avoid O(n²) blowup on large lorebooks
    const dupCheckEntries = factEntries.slice(0, HEALTH_MAX_DUPLICATE_SCAN_ENTRIES);
    for (let i = 0; i < dupCheckEntries.length; i++) {
        for (let j = i + 1; j < dupCheckEntries.length; j++) {
            const a = dupCheckEntries[i];
            const b = dupCheckEntries[j];
            const textA = a.title + ' ' + a.content.substring(0, 200);
            const textB = b.title + ' ' + b.content.substring(0, 200);
            const sim = trigramSimilarity(textA, textB);
            if (sim >= HEALTH_DUPLICATE_CANDIDATE_THRESHOLD) {
                report.duplicateCandidates.push({
                    uidA: a.entry.uid,
                    uidB: b.entry.uid,
                    titleA: a.title || `UID ${a.entry.uid}`,
                    titleB: b.title || `UID ${b.entry.uid}`,
                    bookName,
                    similarity: sim,
                });
            }
        }
        if (report.duplicateCandidates.length >= 20) break;
    }
    report.duplicateCandidates.sort((a, b) => b.similarity - a.similarity);

    // ── Growth rate (entries per 100 chat turns) ──
    try {
        const chatLength = getContext().chat?.length || 0;
        if (chatLength > 0 && report.totalEntries > 0) {
            report.growthRate = Math.round((report.totalEntries / chatLength) * 100 * 10) / 10;
        } else {
            report.growthRate = 0;
        }
    } catch { report.growthRate = 0; }

    // ── Duplicate density (fraction of entries with >0.7 similarity to at least one other) ──
    const dupUids = new Set();
    for (const d of report.duplicateCandidates) {
        if (d.similarity >= HEALTH_DUPLICATE_DENSITY_THRESHOLD) {
            dupUids.add(d.uidA);
            dupUids.add(d.uidB);
        }
    }
    report.duplicateDensity = report.totalEntries > 0
        ? Math.round((dupUids.size / report.totalEntries) * 100) / 100
        : 0;

    // ── Compression ratio: avg current length vs avg first-known length ──
    try {
        const versionStore = getContext().chatMetadata?.['tunnelvision_entry_history'] || {};
        let totalInitial = 0, initialCount = 0;
        for (const key of Object.keys(versionStore)) {
            const versions = versionStore[key];
            if (Array.isArray(versions) && versions.length > 0 && versions[0].previousContent) {
                totalInitial += versions[0].previousContent.length;
                initialCount++;
            }
        }
        if (initialCount > 0 && report.avgLength > 0) {
            const avgInitial = totalInitial / initialCount;
            report.compressionRatio = Math.round((report.avgLength / avgInitial) * 100) / 100;
        } else {
            report.compressionRatio = 1.0;
        }
    } catch { report.compressionRatio = 1.0; }

    // ── Never-referenced entries (feedback exists but references === 0, broader than stale) ──
    let neverReferenced = 0;
    for (const key of Object.keys(bookData.entries)) {
        const entry = bookData.entries[key];
        if (entry.disable) continue;
        const title = entry.comment || '';
        if (isSummaryTitle(title) || isTrackerTitle(title)) continue;
        const fb = feedbackMap[entry.uid];
        if (fb && fb.references === 0) neverReferenced++;
    }
    report.neverReferencedCount = neverReferenced;

    // ── Metadata size breakdown ──
    try {
        const meta = getContext().chatMetadata || {};
        const metaKeys = [
            { key: 'tunnelvision_relevance', label: 'Relevance' },
            { key: 'tunnelvision_feedback', label: 'Feedback' },
            { key: 'tunnelvision_entry_history', label: 'Entry History' },
            { key: 'tunnelvision_entry_temporal', label: 'Temporal' },
            { key: 'tunnelvision_arcs', label: 'Arcs' },
            { key: 'tunnelvision_worldstate', label: 'World State' },
            { key: 'tunnelvision_tracker_hashes', label: 'Tracker Hashes' },
        ];
        report.metadataSizes = metaKeys
            .map(({ key, label }) => {
                const val = meta[key];
                const size = val ? JSON.stringify(val).length : 0;
                return { key: label, size };
            })
            .filter(m => m.size > 0)
            .sort((a, b) => b.size - a.size);
    } catch { report.metadataSizes = []; }

    return report;
}

function buildCategoryDist(node, distMap, entries, isRoot) {
    if (!isRoot && node.entryUids?.length > 0) {
        const activeCount = node.entryUids.filter(uid => {
            for (const key of Object.keys(entries)) {
                if (entries[key].uid === uid && !entries[key].disable) return true;
            }
            return false;
        }).length;
        if (activeCount > 0) {
            distMap.set(node.label || 'Unnamed', (distMap.get(node.label || 'Unnamed') || 0) + activeCount);
        }
    }
    for (const child of (node.children || [])) {
        buildCategoryDist(child, distMap, entries, false);
    }
}
