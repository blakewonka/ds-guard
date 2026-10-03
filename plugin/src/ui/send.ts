import type { UiToMain } from '../shared/messages';

export const send = (msg: UiToMain) => parent.postMessage({ pluginMessage: msg }, '*');
