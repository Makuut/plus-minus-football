const STORAGE_KEY = 'ttd_minimal_data';
const DEFAULT_SETTINGS_KEY = 'ttd_default_settings';
const RECORDING_ENABLED_KEY = 'ttd_recording_enabled';

const DEFAULT_ACTION_KEYS = { plus: '+', minus: '-', removePlus: '/', removeMinus: '*' };

function normalizeShortcutKey(value) {
  return String(value || '').trim().toLowerCase().slice(0, 1);
}

async function getStored(key) {
  const result = await chrome.storage.local.get(key);
  return result[key];
}

async function setStored(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

function getActionKeys(settings = {}) {
  return {
    plus: normalizeShortcutKey(settings.actionKeys?.plus || DEFAULT_ACTION_KEYS.plus),
    minus: normalizeShortcutKey(settings.actionKeys?.minus || DEFAULT_ACTION_KEYS.minus),
    removePlus: normalizeShortcutKey(settings.actionKeys?.removePlus || DEFAULT_ACTION_KEYS.removePlus),
    removeMinus: normalizeShortcutKey(settings.actionKeys?.removeMinus || DEFAULT_ACTION_KEYS.removeMinus)
  };
}

function getShortcutMaps(data) {
  const playersByKey = {};
  for (const id in data.players || {}) {
    const shortcut = normalizeShortcutKey(data.players[id].shortcut);
    if (shortcut && !playersByKey[shortcut]) playersByKey[shortcut] = id;
  }

  const categoriesByKey = {};
  (data.categories || []).forEach((category) => {
    const shortcut = normalizeShortcutKey(category.shortcut);
    if (shortcut && !categoriesByKey[shortcut]) categoriesByKey[shortcut] = category.key;
  });

  return { playersByKey, categoriesByKey };
}

function ensureStatCell(data, playerId, periodKey, categoryKey) {
  if (!data.players?.[playerId] || !periodKey || !categoryKey) return false;
  if (!data.players[playerId].stats) data.players[playerId].stats = {};
  if (!data.players[playerId].stats[periodKey]) data.players[playerId].stats[periodKey] = {};
  if (typeof data.players[playerId].stats[periodKey][categoryKey] !== 'string') {
    data.players[playerId].stats[periodKey][categoryKey] = '';
  }
  return true;
}

function applyStatAction(data, playerId, periodKey, categoryKey, action) {
  if (!ensureStatCell(data, playerId, periodKey, categoryKey)) return null;

  const current = data.players[playerId].stats[periodKey][categoryKey] || '';
  if (action === '+') {
    data.players[playerId].stats[periodKey][categoryKey] = current + '+';
    return 'доб +';
  }
  if (action === '-') {
    data.players[playerId].stats[periodKey][categoryKey] = current + '-';
    return 'доб -';
  }

  const symbol = action === 'removePlus' ? '+' : action === 'removeMinus' ? '-' : '';
  if (!symbol) return null;

  const index = current.lastIndexOf(symbol);
  if (index === -1) return null;

  data.players[playerId].stats[periodKey][categoryKey] =
    current.slice(0, index) + current.slice(index + 1);
  return symbol === '+' ? 'уд +' : 'уд -';
}

async function handleVideoShortcut(message) {
  const recordingEnabled = await getStored(RECORDING_ENABLED_KEY);
  if (recordingEnabled !== true) {
    return { ok: false, handled: false, nextBuffer: '', reason: 'Горячие клавиши неактивны' };
  }

  const data = await getStored(STORAGE_KEY);
  if (!data?.players || !Array.isArray(data.categories) || !Array.isArray(data.periods) || !data.activePeriod) {
    return { ok: false, reason: 'Откройте страницу анализа и настройте игроков' };
  }

  const pressedKey = normalizeShortcutKey(message.key);
  const buffer = String(message.buffer || '');
  if (!pressedKey) return { ok: false };

  const settings = (await getStored(DEFAULT_SETTINGS_KEY)) || {};
  const { playersByKey, categoriesByKey } = getShortcutMaps(data);
  const actionKeys = getActionKeys(settings);
  const actionByKey = {
    [actionKeys.plus]: '+',
    [actionKeys.minus]: '-',
    [actionKeys.removePlus]: 'removePlus',
    [actionKeys.removeMinus]: 'removeMinus'
  };

  if (buffer.length === 0) {
    const playerId = playersByKey[pressedKey];
    if (!playerId) return { ok: false };
    return {
      ok: true,
      handled: true,
      nextBuffer: pressedKey,
      status: data.players[playerId].name
    };
  }

  if (buffer.length === 1) {
    const categoryKey = categoriesByKey[pressedKey];
    if (categoryKey) {
      const playerId = playersByKey[buffer[0]];
      const category = data.categories.find((item) => item.key === categoryKey);
      return {
        ok: true,
        handled: true,
        nextBuffer: buffer + pressedKey,
        status: `${data.players[playerId]?.name || ''} | ${category?.label || ''}`
      };
    }

    const playerId = playersByKey[pressedKey];
    if (playerId) {
      return {
        ok: true,
        handled: true,
        nextBuffer: pressedKey,
        status: data.players[playerId].name
      };
    }

    return { ok: false, nextBuffer: '' };
  }

  if (buffer.length === 2) {
    const action = actionByKey[pressedKey];
    if (action) {
      const playerId = playersByKey[buffer[0]];
      const categoryKey = categoriesByKey[buffer[1]];
      const actionLabel = applyStatAction(data, playerId, data.activePeriod, categoryKey, action);
      if (actionLabel) {
        await setStored(STORAGE_KEY, data);
        const player = data.players[playerId];
        const category = data.categories.find((item) => item.key === categoryKey);
        return {
          ok: true,
          handled: true,
          nextBuffer: '',
          status: `${player?.name || ''} | ${category?.label || ''} | ${actionLabel}`
        };
      }
    }

    const playerId = playersByKey[pressedKey];
    if (playerId) {
      return {
        ok: true,
        handled: true,
        nextBuffer: pressedKey,
        status: data.players[playerId].name
      };
    }
  }

  return { ok: false, nextBuffer: '' };
}

async function updateActionBadge() {
  const enabled = (await getStored(RECORDING_ENABLED_KEY)) === true;
  await chrome.action.setBadgeText({ text: enabled ? 'ON' : 'OFF' });
  await chrome.action.setBadgeBackgroundColor({ color: enabled ? '#168447' : '#777777' });
  await chrome.action.setTitle({
    title: enabled ? 'Plus Minus Football — горячие клавиши активны' : 'Plus Minus Football — горячие клавиши неактивны'
  });
}

chrome.runtime.onInstalled.addListener(updateActionBadge);
chrome.runtime.onStartup.addListener(updateActionBadge);
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[RECORDING_ENABLED_KEY]) updateActionBadge();
});
updateActionBadge();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'ttd-video-shortcut') return false;

  handleVideoShortcut(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, reason: error.message || 'Ошибка горячих клавиш' }));

  return true;
});
