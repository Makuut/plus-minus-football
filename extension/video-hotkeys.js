const TTD_STORAGE_KEY = 'ttd_minimal_data';
const TTD_SETTINGS_KEY = 'ttd_default_settings';
const TTD_RECORDING_ENABLED_KEY = 'ttd_recording_enabled';
const TTD_DEFAULT_ACTION_KEYS = ['+', '-', '/', '*'];
const TTD_BUFFER_TIMEOUT_MS = 2500;

let ttdBuffer = '';
let ttdBufferTimer = null;
let ttdKnownKeys = new Set(TTD_DEFAULT_ACTION_KEYS);
let ttdStatusElement = null;
let ttdStatusTimer = null;
let ttdMessageQueue = Promise.resolve();
let ttdRecordingEnabled = false;

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
    ['plus', 'minus', 'removePlus', 'removeMinus'].forEach((name, index) => {
      const key = ttdNormalizeKey(actionKeys[name] || TTD_DEFAULT_ACTION_KEYS[index]);
      if (key) keys.add(key);
    });

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

  if (event.key === 'Escape' && ttdBuffer) {
    event.preventDefault();
    event.stopPropagation();
    ttdBuffer = '';
    clearTimeout(ttdBufferTimer);
    ttdShowStatus('Ввод сброшен');
    return;
  }

  const key = ttdNormalizeKey(event.key);
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
      ttdShowStatus('Горячие клавиши отключены');
    } else {
      ttdShowStatus('Горячие клавиши активированы');
    }
  }
  if (changes[TTD_STORAGE_KEY] || changes[TTD_SETTINGS_KEY]) ttdRefreshKnownKeys();
});
