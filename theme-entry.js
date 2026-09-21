/**
 * Theme dropdown wiring: populates the Color Theme select with SillyTavern's
 * installed themes and keeps it in sync with the applied theme.
 *
 * Upstream shipped this as the extension's manifest entry point, wrapping
 * index.js behind a cache-busted URL. TunnelVision keeps index.js as the single
 * entry point, so this is an ordinary module index.js calls during init().
 */

import { getRequestHeaders, saveSettingsDebounced } from '../../../../script.js';
import { getSettings } from './tree-store.js';
import { applyTheme, bindThemeSelect, getThemeSelectValue } from './theme.js';
import {
    isValidThemePreset,
    loadInstalledThemePresets,
    populateThemePresetOptions,
} from './theme-presets.js';

/** Wire up the Color Theme select. Call once, after the settings panel renders. */
export function initThemeUI() {
    const settings = getSettings();
    applyTheme(settings.colorTheme, document.documentElement, settings.colorThemePreset);

    const themeSelect = document.getElementById('tv_color_theme');
    const installedThemeSelect = document.getElementById('themes');
    const installedThemeNames = Array.from(installedThemeSelect?.options || [])
        .map(option => option.value || option.textContent)
        .filter(Boolean)
        .map(name => ({ name: String(name).trim() }));

    // A preset saved earlier may no longer be installed; keep it selectable so
    // the dropdown doesn't silently drop the user's current choice.
    if (
        isValidThemePreset(settings.colorThemePreset)
        && !installedThemeNames.some(theme => theme.name === settings.colorThemePreset.name)
    ) {
        installedThemeNames.push({ name: settings.colorThemePreset.name });
    }

    const populatedThemeSelects = new WeakSet();
    const syncThemeSelect = (select) => {
        if (!select) return;
        if (!populatedThemeSelects.has(select)) {
            populateThemePresetOptions(select, installedThemeNames);
            populatedThemeSelects.add(select);
        }
        select.value = getThemeSelectValue(getSettings());
    };
    syncThemeSelect(themeSelect);

    // ST can install themes after we render; repopulate when the user opens it.
    document.addEventListener('focusin', (event) => {
        const focusedSelect = event.target;
        if (!focusedSelect || focusedSelect.id !== 'tv_color_theme') return;
        syncThemeSelect(focusedSelect);
    }, true);

    let installedThemesPromise;
    const loadThemes = () => {
        installedThemesPromise ??= loadInstalledThemePresets(fetch, getRequestHeaders())
            .catch(error => {
                installedThemesPromise = null;
                throw error;
            });
        return installedThemesPromise;
    };
    const resolvePreset = async (name) => {
        const presets = await loadThemes();
        return presets.find(preset => preset.name === name) || null;
    };

    bindThemeSelect(themeSelect, getSettings, saveSettingsDebounced, document.documentElement, document, {
        resolvePreset,
        onPresetError: () => globalThis.toastr?.error?.(
            'Could not load that SillyTavern theme.',
            'TunnelVision theme',
        ),
    });

    // refreshUI() re-applies the theme and stamps data-tv-theme; mirror that
    // back into the select so the two never disagree.
    if (themeSelect && typeof MutationObserver === 'function') {
        const themeMarkerObserver = new MutationObserver(() => {
            themeSelect.value = getThemeSelectValue(getSettings());
        });
        themeMarkerObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-tv-theme'],
        });
    }
}
