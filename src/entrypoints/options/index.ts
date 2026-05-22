import { getSettings, saveSettings } from '../../lib/storage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function load() {
  const s = await getSettings();
  ($<HTMLInputElement>('serverUrl')).value = s.serverUrl;
  ($<HTMLInputElement>('provider')).value = s.provider;
  ($<HTMLInputElement>('model')).value = s.model;
  ($<HTMLInputElement>('targetLang')).value = s.targetLang;
}

$('save').addEventListener('click', async () => {
  await saveSettings({
    serverUrl: ($<HTMLInputElement>('serverUrl')).value.trim(),
    provider: ($<HTMLInputElement>('provider')).value.trim(),
    model: ($<HTMLInputElement>('model')).value.trim(),
    targetLang: ($<HTMLInputElement>('targetLang')).value.trim(),
  });
  const status = $('status');
  status.textContent = '已儲存 ✓';
  setTimeout(() => { status.textContent = ''; }, 2000);
});

load();
