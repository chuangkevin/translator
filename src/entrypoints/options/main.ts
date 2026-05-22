import { getSettings, saveSettings } from '../../lib/storage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

type ProviderMap = Record<string, { name: string; models: string[] }>;

let providerMap: ProviderMap = {};

async function fetchProviders(serverUrl: string): Promise<ProviderMap> {
  const url = serverUrl.replace(/\/$/, '') + '/provider';
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { all?: Array<{ id: string; name: string; models?: Record<string, unknown> }> };
  const map: ProviderMap = {};
  for (const p of data.all ?? []) {
    const models = Object.keys(p.models ?? {});
    if (models.length > 0) map[p.id] = { name: p.name, models };
  }
  return map;
}

function populateProviders(map: ProviderMap, selectedProvider: string) {
  const sel = $<HTMLSelectElement>('provider');
  sel.innerHTML = '';
  for (const [id, info] of Object.entries(map)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = info.name || id;
    if (id === selectedProvider) opt.selected = true;
    sel.appendChild(opt);
  }
}

function populateModels(models: string[], selectedModel: string) {
  const sel = $<HTMLSelectElement>('model');
  sel.innerHTML = '';
  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    if (m === selectedModel) opt.selected = true;
    sel.appendChild(opt);
  }
}

function onProviderChange(selectedModel = '') {
  const providerId = $<HTMLSelectElement>('provider').value;
  const models = providerMap[providerId]?.models ?? [];
  populateModels(models, selectedModel);
}

async function loadModels(serverUrl: string, selectedProvider: string, selectedModel: string) {
  const statusEl = $('fetch-status');
  statusEl.textContent = '載入中…';
  try {
    providerMap = await fetchProviders(serverUrl);
    populateProviders(providerMap, selectedProvider);
    onProviderChange(selectedModel);
    statusEl.textContent = `已載入 ${Object.keys(providerMap).length} 個 provider`;
  } catch (e) {
    statusEl.textContent = `載入失敗：${(e as Error).message}`;
  }
}

async function load() {
  const s = await getSettings();
  ($<HTMLInputElement>('serverUrl')).value = s.serverUrl;
  ($<HTMLInputElement>('targetLang')).value = s.targetLang;

  if (s.serverUrl) {
    await loadModels(s.serverUrl, s.provider, s.model);
  }
}

$('fetch-models').addEventListener('click', async () => {
  const url = ($<HTMLInputElement>('serverUrl')).value.trim();
  if (!url) { $('fetch-status').textContent = '請先輸入 Server URL'; return; }
  const cur = $<HTMLSelectElement>('provider').value;
  const curModel = $<HTMLSelectElement>('model').value;
  await loadModels(url, cur, curModel);
});

$<HTMLSelectElement>('provider').addEventListener('change', () => onProviderChange());

$('save').addEventListener('click', async () => {
  await saveSettings({
    serverUrl: ($<HTMLInputElement>('serverUrl')).value.trim(),
    provider: $<HTMLSelectElement>('provider').value,
    model: $<HTMLSelectElement>('model').value,
    targetLang: ($<HTMLInputElement>('targetLang')).value.trim(),
  });
  const status = $('status');
  status.textContent = '已儲存 ✓';
  setTimeout(() => { status.textContent = ''; }, 2000);
});

load();
