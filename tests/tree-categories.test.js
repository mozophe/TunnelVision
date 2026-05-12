import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

let nodeIdCounter = 0;

vi.mock('../tree-store.js', () => ({
    createTreeNode: vi.fn((label = 'New Category', summary = '') => ({
        id: `node_${++nodeIdCounter}`,
        label,
        summary,
        entryUids: [],
        children: [],
        collapsed: false,
    })),
}));

// ── Import under test ────────────────────────────────────────────

import {
    normalizeCategoryLabel,
    findChildCategoryByLabel,
    findCategoryByLabel,
    findOrCreateChildCategory,
} from '../tree-categories.js';

// ── Helpers ──────────────────────────────────────────────────────

function makeNode(label, children = []) {
    return {
        id: `node_${++nodeIdCounter}`,
        label,
        summary: '',
        entryUids: [],
        children,
        collapsed: false,
    };
}

function makeTree() {
    return makeNode('Root', [
        makeNode('Characters', [
            makeNode('Allies'),
            makeNode('Enemies'),
        ]),
        makeNode('Locations', [
            makeNode('Cities'),
        ]),
        makeNode('Plot Points'),
    ]);
}

// ── Tests ─────────────────────────────────────────────────���──────

describe('normalizeCategoryLabel', () => {
    it('trims leading and trailing whitespace', () => {
        expect(normalizeCategoryLabel('  Characters  ')).toBe('characters');
    });

    it('collapses multiple internal spaces', () => {
        expect(normalizeCategoryLabel('Plot   Points')).toBe('plot points');
    });

    it('lowercases the label', () => {
        expect(normalizeCategoryLabel('CHARACTERS')).toBe('characters');
        expect(normalizeCategoryLabel('ChArAcTeRs')).toBe('characters');
    });

    it('handles combined whitespace and case', () => {
        expect(normalizeCategoryLabel('  Plot   POINTS  ')).toBe('plot points');
    });

    it('returns empty string for null', () => {
        expect(normalizeCategoryLabel(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
        expect(normalizeCategoryLabel(undefined)).toBe('');
    });

    it('returns empty string for empty string', () => {
        expect(normalizeCategoryLabel('')).toBe('');
    });

    it('returns empty string for whitespace-only input', () => {
        expect(normalizeCategoryLabel('   ')).toBe('');
    });

    it('coerces non-string types', () => {
        expect(normalizeCategoryLabel(123)).toBe('123');
        expect(normalizeCategoryLabel(false)).toBe('');
    });

    it('handles tabs and newlines as whitespace', () => {
        expect(normalizeCategoryLabel('Plot\t\nPoints')).toBe('plot points');
    });
});

// ── findChildCategoryByLabel ─────────────────────────────────────

describe('findChildCategoryByLabel', () => {
    it('finds an exact-match child', () => {
        const root = makeTree();
        const result = findChildCategoryByLabel(root, 'Characters');
        expect(result).toBe(root.children[0]);
    });

    it('finds a case-insensitive child', () => {
        const root = makeTree();
        const result = findChildCategoryByLabel(root, 'characters');
        expect(result).toBe(root.children[0]);
    });

    it('finds a child with extra whitespace in search', () => {
        const root = makeTree();
        const result = findChildCategoryByLabel(root, '  Characters  ');
        expect(result).toBe(root.children[0]);
    });

    it('finds a multi-word child with spacing variants', () => {
        const root = makeTree();
        const result = findChildCategoryByLabel(root, 'plot   points');
        expect(result).toBe(root.children[2]);
    });

    it('returns null when no child matches', () => {
        const root = makeTree();
        expect(findChildCategoryByLabel(root, 'Nonexistent')).toBeNull();
    });

    it('does NOT match grandchildren (only direct children)', () => {
        const root = makeTree();
        // 'Allies' is a grandchild under Characters, not a direct child of root
        expect(findChildCategoryByLabel(root, 'Allies')).toBeNull();
    });

    it('returns null for null parent', () => {
        expect(findChildCategoryByLabel(null, 'Characters')).toBeNull();
    });

    it('returns null for empty label', () => {
        const root = makeTree();
        expect(findChildCategoryByLabel(root, '')).toBeNull();
    });

    it('returns null for null label', () => {
        const root = makeTree();
        expect(findChildCategoryByLabel(root, null)).toBeNull();
    });

    it('returns null for parent with no children', () => {
        const leaf = makeNode('Leaf');
        expect(findChildCategoryByLabel(leaf, 'anything')).toBeNull();
    });

    it('returns null for parent with undefined children', () => {
        const node = { id: 'x', label: 'X', children: undefined };
        expect(findChildCategoryByLabel(node, 'anything')).toBeNull();
    });
});

// ── findCategoryByLabel ──────────────────────────────────────────

describe('findCategoryByLabel', () => {
    it('finds a top-level category', () => {
        const root = makeTree();
        const result = findCategoryByLabel(root, 'Locations');
        expect(result).toBe(root.children[1]);
    });

    it('finds a nested category (depth 2)', () => {
        const root = makeTree();
        const result = findCategoryByLabel(root, 'Allies');
        expect(result).toBe(root.children[0].children[0]);
    });

    it('finds a nested category (depth 2, different branch)', () => {
        const root = makeTree();
        const result = findCategoryByLabel(root, 'Cities');
        expect(result).toBe(root.children[1].children[0]);
    });

    it('is case-insensitive', () => {
        const root = makeTree();
        const result = findCategoryByLabel(root, 'ENEMIES');
        expect(result).toBe(root.children[0].children[1]);
    });

    it('handles extra whitespace', () => {
        const root = makeTree();
        const result = findCategoryByLabel(root, '  plot   points  ');
        expect(result).toBe(root.children[2]);
    });

    it('returns the first depth-first match when duplicates exist', () => {
        const dup1 = makeNode('Items');
        const dup2 = makeNode('Items');
        const root = makeNode('Root', [
            makeNode('Characters', [dup1]),
            dup2,
        ]);
        const result = findCategoryByLabel(root, 'Items');
        expect(result).toBe(dup1);
    });

    it('returns null when no match exists', () => {
        const root = makeTree();
        expect(findCategoryByLabel(root, 'Magic Systems')).toBeNull();
    });

    it('returns null for null root', () => {
        expect(findCategoryByLabel(null, 'Characters')).toBeNull();
    });

    it('returns null for empty label', () => {
        const root = makeTree();
        expect(findCategoryByLabel(root, '')).toBeNull();
    });

    it('returns null for null label', () => {
        const root = makeTree();
        expect(findCategoryByLabel(root, null)).toBeNull();
    });

    it('does not match the root node itself', () => {
        const root = makeTree();
        expect(findCategoryByLabel(root, 'Root')).toBeNull();
    });

    it('searches deeply nested trees (depth 3+)', () => {
        const deep = makeNode('DeepLeaf');
        const root = makeNode('Root', [
            makeNode('A', [
                makeNode('B', [
                    makeNode('C', [deep]),
                ]),
            ]),
        ]);
        const result = findCategoryByLabel(root, 'DeepLeaf');
        expect(result).toBe(deep);
    });
});

// ── findOrCreateChildCategory ────────────────────────────────────

describe('findOrCreateChildCategory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        nodeIdCounter = 0;
    });

    it('creates a new child when no match exists', () => {
        const parent = makeNode('Root');
        const result = findOrCreateChildCategory(parent, 'Characters');

        expect(result.created).toBe(true);
        expect(result.node.label).toBe('Characters');
        expect(result.node.summary).toBe('');
        expect(parent.children).toHaveLength(1);
        expect(parent.children[0]).toBe(result.node);
    });

    it('reuses existing child with exact same label', () => {
        const existing = makeNode('Characters');
        const parent = makeNode('Root', [existing]);

        const result = findOrCreateChildCategory(parent, 'Characters');

        expect(result.created).toBe(false);
        expect(result.node).toBe(existing);
        expect(parent.children).toHaveLength(1);
    });

    it('reuses existing child with different casing', () => {
        const existing = makeNode('Characters');
        const parent = makeNode('Root', [existing]);

        const result = findOrCreateChildCategory(parent, 'CHARACTERS');

        expect(result.created).toBe(false);
        expect(result.node).toBe(existing);
        expect(parent.children).toHaveLength(1);
    });

    it('reuses existing child with different spacing', () => {
        const existing = makeNode('Plot Points');
        const parent = makeNode('Root', [existing]);

        const result = findOrCreateChildCategory(parent, '  plot   points  ');

        expect(result.created).toBe(false);
        expect(result.node).toBe(existing);
        expect(parent.children).toHaveLength(1);
    });

    it('trims and normalizes the label of newly created categories', () => {
        const parent = makeNode('Root');
        const result = findOrCreateChildCategory(parent, '  My  New   Category  ');

        expect(result.created).toBe(true);
        expect(result.node.label).toBe('My New Category');
        expect(parent.children).toHaveLength(1);
        expect(parent.children[0]).toBe(result.node);
    });

    it('passes summary to createTreeNode for new categories', () => {
        const parent = makeNode('Root');
        const result = findOrCreateChildCategory(parent, 'Items', 'All items');

        expect(result.created).toBe(true);
        expect(result.node.label).toBe('Items');
        expect(result.node.summary).toBe('All items');
        expect(parent.children).toHaveLength(1);
    });

    it('does not overwrite summary of existing category', () => {
        const existing = makeNode('Characters');
        existing.summary = 'Original summary';
        const parent = makeNode('Root', [existing]);

        const result = findOrCreateChildCategory(parent, 'Characters', 'New summary');

        expect(result.created).toBe(false);
        expect(result.node.summary).toBe('Original summary');
    });

    it('throws when parent is null', () => {
        expect(() => findOrCreateChildCategory(null, 'Test')).toThrow('Parent node is required');
    });

    it('throws when parent is undefined', () => {
        expect(() => findOrCreateChildCategory(undefined, 'Test')).toThrow('Parent node is required');
    });

    it('throws when label is empty string', () => {
        const parent = makeNode('Root');
        expect(() => findOrCreateChildCategory(parent, '')).toThrow('Category label cannot be empty');
    });

    it('throws when label is whitespace only', () => {
        const parent = makeNode('Root');
        expect(() => findOrCreateChildCategory(parent, '   ')).toThrow('Category label cannot be empty');
    });

    it('throws when label is null', () => {
        const parent = makeNode('Root');
        expect(() => findOrCreateChildCategory(parent, null)).toThrow('Category label cannot be empty');
    });

    it('does not create duplicates when called twice with same label', () => {
        const parent = makeNode('Root');

        const first = findOrCreateChildCategory(parent, 'Characters');
        const second = findOrCreateChildCategory(parent, 'Characters');

        expect(first.created).toBe(true);
        expect(second.created).toBe(false);
        expect(first.node).toBe(second.node);
        expect(parent.children).toHaveLength(1);
    });

    it('does not create duplicates with case variation on second call', () => {
        const parent = makeNode('Root');

        const first = findOrCreateChildCategory(parent, 'Characters');
        const second = findOrCreateChildCategory(parent, 'characters');

        expect(first.created).toBe(true);
        expect(second.created).toBe(false);
        expect(first.node).toBe(second.node);
        expect(parent.children).toHaveLength(1);
    });

    it('creates distinct categories under different parents', () => {
        const parentA = makeNode('Branch A');
        const parentB = makeNode('Branch B');

        const resultA = findOrCreateChildCategory(parentA, 'Characters');
        const resultB = findOrCreateChildCategory(parentB, 'Characters');

        expect(resultA.created).toBe(true);
        expect(resultB.created).toBe(true);
        expect(resultA.node).not.toBe(resultB.node);
    });

    it('allows different labels under the same parent', () => {
        const parent = makeNode('Root');

        const a = findOrCreateChildCategory(parent, 'Characters');
        const b = findOrCreateChildCategory(parent, 'Locations');

        expect(a.created).toBe(true);
        expect(b.created).toBe(true);
        expect(parent.children).toHaveLength(2);
        expect(a.node).not.toBe(b.node);
    });

    it('uses default empty string for summary when not provided', () => {
        const parent = makeNode('Root');
        const result = findOrCreateChildCategory(parent, 'Items');

        expect(result.created).toBe(true);
        expect(result.node.label).toBe('Items');
        expect(result.node.summary).toBe('');
        expect(parent.children).toHaveLength(1);
    });
});

// ── Integration-style: duplicate prevention scenarios ─────────────

describe('duplicate prevention scenarios', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        nodeIdCounter = 0;
    });

    it('prevents the exact bug: model creates same category twice', () => {
        // Simulate what happens when the AI calls create_category twice with "Characters"
        const root = makeNode('Root');

        // First call — creates
        const first = findOrCreateChildCategory(root, 'Characters');
        expect(first.created).toBe(true);

        // Second call — reuses
        const second = findOrCreateChildCategory(root, 'Characters');
        expect(second.created).toBe(false);
        expect(second.node).toBe(first.node);

        // Only one child
        expect(root.children).toHaveLength(1);
    });

    it('prevents casing-variant duplicates: "characters" vs "Characters" vs "CHARACTERS"', () => {
        const root = makeNode('Root');

        findOrCreateChildCategory(root, 'Characters');
        findOrCreateChildCategory(root, 'characters');
        findOrCreateChildCategory(root, 'CHARACTERS');

        expect(root.children).toHaveLength(1);
    });

    it('prevents whitespace-variant duplicates', () => {
        const root = makeNode('Root');

        findOrCreateChildCategory(root, 'Plot Points');
        findOrCreateChildCategory(root, '  Plot   Points  ');
        findOrCreateChildCategory(root, 'plot points');

        expect(root.children).toHaveLength(1);
    });

    it('lifecycle "new:" scenario: does not create when existing category matches', () => {
        // Simulate lifecycle reorganization where LLM says "new: Characters"
        // but "Characters" already exists
        const root = makeTree();
        const originalCount = root.children.length;

        // Check if category already exists in tree
        const existing = findCategoryByLabel(root, 'Characters');
        expect(existing).toBeTruthy();

        // If it does exist, don't call findOrCreateChildCategory with it
        // But if you do, it should still be safe:
        const result = findOrCreateChildCategory(root, 'Characters');
        expect(result.created).toBe(false);
        expect(root.children).toHaveLength(originalCount);
    });

    it('lifecycle "new:" scenario: creates when truly new category', () => {
        const root = makeTree();
        const originalCount = root.children.length;

        const existing = findCategoryByLabel(root, 'Magic Systems');
        expect(existing).toBeNull();

        const result = findOrCreateChildCategory(root, 'Magic Systems');
        expect(result.created).toBe(true);
        expect(root.children).toHaveLength(originalCount + 1);
    });

    it('findCategoryByLabel + findOrCreateChildCategory combined workflow', () => {
        const root = makeTree();

        // Scenario: lifecycle gets "new: Allies" from LLM
        // First check tree-wide
        const treeWide = findCategoryByLabel(root, 'Allies');
        expect(treeWide).toBeTruthy();
        expect(treeWide.label).toBe('Allies');

        // Because we found it tree-wide, we use it directly instead of creating
        // This tests the logic pattern used in memory-lifecycle.js
        expect(treeWide).toBe(root.children[0].children[0]);
    });
});