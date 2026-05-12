/**
 * TunnelVision Tree Categories
 * Category lookup, deduplication, and creation helpers for the tree index.
 * Extracted from tree-store.js to keep category semantics separate from
 * tree persistence, settings, and generic node primitives.
 */

import { createTreeNode } from './tree-store.js';

/**
 * Normalize a category label for duplicate-safe comparisons.
 * Trims, collapses whitespace, and lowercases.
 * @param {string} label
 * @returns {string}
 */
export function normalizeCategoryLabel(label) {
    return String(label || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Find a direct child category under a parent by normalized label.
 * @param {TreeNode} parentNode
 * @param {string} label
 * @returns {TreeNode|null}
 */
export function findChildCategoryByLabel(parentNode, label) {
    if (!parentNode) return null;
    const normalized = normalizeCategoryLabel(label);
    if (!normalized) return null;
    return (parentNode.children || []).find(child =>
        normalizeCategoryLabel(child.label) === normalized,
    ) || null;
}

/**
 * Find any category node in a tree by normalized label (depth-first).
 * Returns the first match.
 * @param {TreeNode} root
 * @param {string} label
 * @returns {TreeNode|null}
 */
export function findCategoryByLabel(root, label) {
    if (!root) return null;
    const normalized = normalizeCategoryLabel(label);
    if (!normalized) return null;

    for (const child of (root.children || [])) {
        if (normalizeCategoryLabel(child.label) === normalized) {
            return child;
        }
        const found = findCategoryByLabel(child, label);
        if (found) return found;
    }

    return null;
}

/**
 * Find a category by label under a parent, creating it only if no
 * sibling with the same normalized label exists.
 * Prevents duplicate categories that differ only by case or spacing.
 * @param {TreeNode} parentNode
 * @param {string} label
 * @param {string} [summary]
 * @returns {{ node: TreeNode, created: boolean }}
 */
export function findOrCreateChildCategory(parentNode, label, summary = '') {
    if (!parentNode) {
        throw new Error('Parent node is required.');
    }

    const trimmedLabel = String(label || '').trim().replace(/\s+/g, ' ');
    if (!trimmedLabel) {
        throw new Error('Category label cannot be empty.');
    }

    const existing = findChildCategoryByLabel(parentNode, trimmedLabel);
    if (existing) {
        return { node: existing, created: false };
    }

    const newNode = createTreeNode(trimmedLabel, summary);
    parentNode.children.push(newNode);
    return { node: newNode, created: true };
}