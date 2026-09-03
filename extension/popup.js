const RECORDING_ENABLED_KEY = 'ttd_recording_enabled';

const statusElement = document.getElementById('recordingStatus');
const enableButton = document.getElementById('enableButton');
const disableButton = document.getElementById('disableButton');

function render(enabled) {
  statusElement.textContent = enabled ? 'Горячие клавиши активны' : 'Горячие клавиши неактивны';
  statusElement.classList.toggle('on', enabled);
  statusElement.classList.toggle('off', !enabled);
  enableButton.disabled = enabled;
  disableButton.disabled = !enabled;
}

async function setRecording(enabled) {
  await chrome.storage.local.set({ [RECORDING_ENABLED_KEY]: enabled });
  render(enabled);
}

enableButton.addEventListener('click', () => setRecording(true));
disableButton.addEventListener('click', () => setRecording(false));
document.getElementById('openAnalyzerButton').addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('football-analyze.html') });
  window.close();
});

chrome.storage.local.get(RECORDING_ENABLED_KEY).then((values) => {
  render(values[RECORDING_ENABLED_KEY] === true);
});
