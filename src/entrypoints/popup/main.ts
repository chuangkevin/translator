import { getSettings } from '../../lib/storage';

document.getElementById('open-options')?.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

getSettings().then(s => {
  const info = document.getElementById('server-info');
  if (info) info.textContent = `Server: ${s.serverUrl}`;
});
