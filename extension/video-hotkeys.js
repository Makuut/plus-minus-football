const TTD_STORAGE_KEY = 'ttd_minimal_data';
const TTD_SETTINGS_KEY = 'ttd_default_settings';
const TTD_RECORDING_ENABLED_KEY = 'ttd_recording_enabled';
const TTD_DEFAULT_ACTION_KEYS = ['+', '-', '/', '*', '.', 'h'];
const TTD_BUFFER_TIMEOUT_MS = 3500;

let ttdBuffer = '';
let ttdBufferTimer = null;
let ttdKnownKeys = new Set(TTD_DEFAULT_ACTION_KEYS);
let ttdStatusElement = null;
let ttdStatusTimer = null;
let ttdMessageQueue = Promise.resolve();
let ttdRecordingEnabled = false;
let ttdResetKey = TTD_DEFAULT_ACTION_KEYS[4];
let ttdHelpKey = TTD_DEFAULT_ACTION_KEYS[5];
let ttdHelpOverlay = null;
let ttdHelpData = {};
let ttdHelpSettings = {};

function ttdNormalizeKey(value) {
  return String(value || '').trim().toLowerCase().slice(0, 1);
}

function ttdIsTypingTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'));
}

function ttdRefreshKnownKeys() {
  chrome.storage.local.get([TTD_STORAGE_KEY, TTD_SETTINGS_KEY, TTD_RECORDING_ENABLED_KEY], (values) => {
    if (chrome.runtime.lastError) return;

    const keys = new Set();
    const data = values[TTD_STORAGE_KEY] || {};
    const settings = values[TTD_SETTINGS_KEY] || {};
    ttdHelpData = data;
    ttdHelpSettings = settings;
    ttdRecordingEnabled = values[TTD_RECORDING_ENABLED_KEY] === true;

    Object.values(data.players || {}).forEach((player) => {
      const key = ttdNormalizeKey(player?.shortcut);
      if (key) keys.add(key);
    });
    (data.categories || []).forEach((category) => {
      const key = ttdNormalizeKey(category?.shortcut);
      if (key) keys.add(key);
    });

    const actionKeys = settings.actionKeys || {};
    ['plus', 'minus', 'removePlus', 'removeMinus', 'reset', 'help'].forEach((name, index) => {
      const key = ttdNormalizeKey(actionKeys[name] || TTD_DEFAULT_ACTION_KEYS[index]);
      if (key) keys.add(key);
    });
    ttdResetKey = ttdNormalizeKey(actionKeys.reset || TTD_DEFAULT_ACTION_KEYS[4]);
    ttdHelpKey = ttdNormalizeKey(actionKeys.help || TTD_DEFAULT_ACTION_KEYS[5]);

    ttdKnownKeys = keys;
  });
}

function ttdResetBufferAfterDelay() {
  clearTimeout(ttdBufferTimer);
  if (!ttdBuffer) return;
  ttdBufferTimer = setTimeout(() => {
    ttdBuffer = '';
    ttdShowStatus('Ввод сброшен', true);
  }, TTD_BUFFER_TIMEOUT_MS);
}

function ttdGetStatusElement() {
  if (ttdStatusElement?.isConnected) return ttdStatusElement;

  const element = document.createElement('div');
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  Object.assign(element.style, {
    position: 'fixed',
    zIndex: '2147483647',
    top: '18px',
    left: '50%',
    maxWidth: 'min(420px, calc(100vw - 36px))',
    padding: '10px 14px',
    borderRadius: '7px',
    background: 'rgba(20, 20, 20, 0.92)',
    color: '#fff',
    font: '600 14px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    boxShadow: '0 4px 18px rgba(0, 0, 0, 0.3)',
    pointerEvents: 'none',
    opacity: '0',
    transform: 'translate(-50%, -6px)',
    transition: 'opacity 120ms ease, transform 120ms ease'
  });
  (document.body || document.documentElement).appendChild(element);
  ttdStatusElement = element;
  return element;
}

function ttdShowStatus(message, isError = false) {
  if (!message) return;
  const element = ttdGetStatusElement();
  element.textContent = message;
  element.style.background = isError ? 'rgba(150, 35, 35, 0.94)' : 'rgba(20, 20, 20, 0.92)';
  element.style.opacity = '1';
  element.style.transform = 'translate(-50%, 0)';
  clearTimeout(ttdStatusTimer);
  ttdStatusTimer = setTimeout(() => {
    element.style.opacity = '0';
    element.style.transform = 'translate(-50%, -6px)';
  }, isError ? 2200 : 1400);
}

function ttdCloseHelp() {
  if (ttdHelpOverlay?.isConnected) ttdHelpOverlay.remove();
  ttdHelpOverlay = null;
}

function ttdCreateHelpSection(title, items) {
  const section = document.createElement('section');
  Object.assign(section.style, { minWidth: '0' });
  const heading = document.createElement('h3');
  heading.textContent = title;
  Object.assign(heading.style, { margin: '0 0 10px', fontSize: '16px', color: '#9ee7ba' });
  section.appendChild(heading);

  const list = document.createElement('div');
  Object.assign(list.style, { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '7px 10px', alignItems: 'center' });
  items.forEach((item) => {
    if (item?.header) {
      const group = document.createElement('strong');
      group.textContent = item.header;
      Object.assign(group.style, { gridColumn: '1 / -1', marginTop: '5px', paddingBottom: '3px', borderBottom: '1px solid #4b544f', color: '#ffd479' });
      list.appendChild(group);
      return;
    }

    const [label, key] = item;
    const name = document.createElement('span');
    name.textContent = label;
    Object.assign(name.style, { minWidth: '0', overflowWrap: 'anywhere' });
    const shortcut = document.createElement('kbd');
    shortcut.textContent = key || '—';
    Object.assign(shortcut.style, { minWidth: '24px', padding: '2px 7px', border: '1px solid #68706b', borderRadius: '4px', background: '#303532', color: '#fff', textAlign: 'center' });
    list.append(shortcut, name);
  });
  section.appendChild(list);
  return section;
}

function ttdToggleHelp() {
  if (ttdHelpOverlay?.isConnected) {
    ttdCloseHelp();
    return;
  }

  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '2147483647', display: 'grid', alignItems: 'start',
    padding: '12px', background: 'rgba(0, 0, 0, 0.02)', color: '#fff', overflow: 'auto',
    font: '14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  });

  const activePeriod = ttdHelpData.periods?.find((period) => period.key === ttdHelpData.activePeriod);
  const period = document.createElement('p');
  period.textContent = `Активный период: ${activePeriod?.label || 'не выбран'}`;
  Object.assign(period.style, { margin: '0 0 14px', paddingBottom: '10px', borderBottom: '1px solid #68706b', fontWeight: '700', color: '#ffd479', textAlign: 'center' });

  const playersByTeam = {};
  Object.values(ttdHelpData.players || {}).forEach((player) => {
    const team = String(player.team || '—').trim() || '—';
    if (!playersByTeam[team]) playersByTeam[team] = [];
    playersByTeam[team].push(player);
  });
  const players = [];
  Object.keys(playersByTeam).sort((a, b) => a.localeCompare(b, 'ru')).forEach((team) => {
    players.push({ header: team });
    playersByTeam[team]
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'))
      .forEach((player) => players.push([player.name, ttdNormalizeKey(player.shortcut)]));
  });
  const categories = (ttdHelpData.categories || []).map((category) => [category.label, ttdNormalizeKey(category.shortcut)]);
  const keys = ttdHelpSettings.actionKeys || {};
  const actions = [
    ['Добавить успешное действие', ttdNormalizeKey(keys.plus || TTD_DEFAULT_ACTION_KEYS[0])],
    ['Добавить неуспешное действие', ttdNormalizeKey(keys.minus || TTD_DEFAULT_ACTION_KEYS[1])],
    ['Удалить последний +', ttdNormalizeKey(keys.removePlus || TTD_DEFAULT_ACTION_KEYS[2])],
    ['Удалить последний −', ttdNormalizeKey(keys.removeMinus || TTD_DEFAULT_ACTION_KEYS[3])],
    ['Сбросить ввод', ttdNormalizeKey(keys.reset || TTD_DEFAULT_ACTION_KEYS[4])],
    ['Открыть/закрыть подсказку', ttdHelpKey]
  ];

  const columns = document.createElement('div');
  columns.setAttribute('role', 'dialog');
  columns.setAttribute('aria-modal', 'true');
  Object.assign(columns.style, { width: '100%', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(220px, 1fr))', gap: '18px', alignItems: 'start' });

  const playerPanel = ttdCreateHelpSection('Игроки', players.length ? players : [['Игроки не настроены', '—']]);
  playerPanel.prepend(period);
  const categoryPanel = ttdCreateHelpSection('Показатели', categories.length ? categories : [['Показатели не настроены', '—']]);
  const actionPanel = ttdCreateHelpSection('Действия', actions);
  const panels = [playerPanel, categoryPanel, actionPanel];
  panels.forEach((panel) => Object.assign(panel.style, {
    padding: '16px', border: '1px solid rgba(255,255,255,.18)', borderRadius: '10px',
    width: 'min(340px, 100%)', background: 'rgba(20, 24, 22, 0.42)', boxShadow: '0 8px 28px rgba(0,0,0,.2)',
    backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)'
  }));
  playerPanel.style.justifySelf = 'start';
  categoryPanel.style.justifySelf = 'center';
  actionPanel.style.justifySelf = 'end';
  columns.append(...panels);

  overlay.appendChild(columns);
  overlay.addEventListener('click', (event) => {
    if (!panels.some((panel) => panel.contains(event.target))) ttdCloseHelp();
  });
  (document.body || document.documentElement).appendChild(overlay);
  ttdHelpOverlay = overlay;
}

function ttdSendKey(key) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'ttd-video-shortcut', key, buffer: ttdBuffer },
      (response) => {
        if (chrome.runtime.lastError) {
          ttdBuffer = '';
          clearTimeout(ttdBufferTimer);
          resolve();
          return;
        }

        if (typeof response?.nextBuffer === 'string') {
          ttdBuffer = response.nextBuffer;
        } else if (!response?.handled) {
          ttdBuffer = '';
        }

        if (response?.status) ttdShowStatus(response.status, !response.ok);
        if (response?.reason) ttdShowStatus(response.reason, true);
        ttdResetBufferAfterDelay();
        resolve();
      }
    );
  });
}

function ttdHandleKeydown(event) {
  if (event.defaultPrevented || event.repeat || event.isComposing) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  if (!ttdRecordingEnabled || ttdIsTypingTarget(event.target)) return;

  const key = ttdNormalizeKey(event.key);
  if (key === ttdHelpKey) {
    event.preventDefault();
    event.stopPropagation();
    ttdBuffer = '';
    clearTimeout(ttdBufferTimer);
    ttdToggleHelp();
    return;
  }
  if (key === ttdResetKey && ttdBuffer) {
    event.preventDefault();
    event.stopPropagation();
    ttdBuffer = '';
    clearTimeout(ttdBufferTimer);
    ttdShowStatus('Ввод сброшен');
    return;
  }

  if (!key || !ttdKnownKeys.has(key)) return;

  // Prevent video players and the host page from also handling analyzer shortcuts.
  event.preventDefault();
  event.stopPropagation();

  ttdMessageQueue = ttdMessageQueue.then(() => ttdSendKey(key));
}

document.addEventListener('keydown', ttdHandleKeydown, true);
ttdRefreshKnownKeys();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes[TTD_RECORDING_ENABLED_KEY]) {
    ttdRecordingEnabled = changes[TTD_RECORDING_ENABLED_KEY].newValue === true;
    if (!ttdRecordingEnabled) {
      ttdBuffer = '';
      clearTimeout(ttdBufferTimer);
      ttdCloseHelp();
      ttdShowStatus('Горячие клавиши отключены');
    } else {
      ttdShowStatus('Горячие клавиши активированы');
    }
  }
  if (changes[TTD_STORAGE_KEY] || changes[TTD_SETTINGS_KEY]) ttdRefreshKnownKeys();
});
