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

// ── Server list UI ─────────────────────────────────────────────────────────

function getServerUrls(): string[] {
  const inputs = document.querySelectorAll<HTMLInputElement>('#server-list input.server-url');
  return Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
}

function renderServerList(urls: string[]) {
  const list = $('server-list');
  list.innerHTML = '';
  const safeUrls = urls.length > 0 ? urls : [''];
  safeUrls.forEach((url, idx) => {
    const entry = document.createElement('div');
    entry.className = 'server-entry';

    const input = document.createElement('input');
    input.type = 'url';
    input.className = 'server-url';
    input.value = url;
    input.placeholder = 'http://localhost:3000';

    const controls = document.createElement('div');
    controls.className = 'server-entry-controls';

    const upBtn = document.createElement('button');
    upBtn.className = 'icon-btn';
    upBtn.title = '上移';
    upBtn.textContent = '↑';
    upBtn.disabled = idx === 0;
    upBtn.addEventListener('click', () => {
      const current = getServerUrls();
      if (idx === 0) return;
      [current[idx - 1], current[idx]] = [current[idx], current[idx - 1]];
      renderServerList(current);
    });

    const downBtn = document.createElement('button');
    downBtn.className = 'icon-btn';
    downBtn.title = '下移';
    downBtn.textContent = '↓';
    downBtn.disabled = idx === safeUrls.length - 1;
    downBtn.addEventListener('click', () => {
      const current = getServerUrls();
      if (idx === current.length - 1) return;
      [current[idx], current[idx + 1]] = [current[idx + 1], current[idx]];
      renderServerList(current);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn danger';
    delBtn.title = '刪除';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      const current = getServerUrls();
      current.splice(idx, 1);
      renderServerList(current.length > 0 ? current : ['']);
    });

    controls.appendChild(upBtn);
    controls.appendChild(downBtn);
    controls.appendChild(delBtn);
    entry.appendChild(input);
    entry.appendChild(controls);
    list.appendChild(entry);
  });
}

// ── Init ────────────────────────────────────────────────────────────────────

$('add-server').addEventListener('click', () => {
  const current = getServerUrls();
  current.push('');
  renderServerList(current);
  const inputs = document.querySelectorAll<HTMLInputElement>('#server-list input.server-url');
  inputs[inputs.length - 1]?.focus();
});

$('fetch-models').addEventListener('click', async () => {
  const urls = getServerUrls();
  const url = urls[0];
  if (!url) { $('fetch-status').textContent = '請先輸入 Server URL'; return; }
  const cur = $<HTMLSelectElement>('provider').value;
  const curModel = $<HTMLSelectElement>('model').value;
  await loadModels(url, cur, curModel);
});

$<HTMLSelectElement>('provider').addEventListener('change', () => onProviderChange());

$('save').addEventListener('click', async () => {
  const serverUrls = getServerUrls();
  if (serverUrls.length === 0) {
    $('status').textContent = '請至少輸入一個 Server URL';
    return;
  }
  await saveSettings({
    serverUrls,
    provider: $<HTMLSelectElement>('provider').value,
    model: $<HTMLSelectElement>('model').value,
    targetLang: ($<HTMLInputElement>('targetLang')).value.trim(),
  });
  const status = $('status');
  status.textContent = '已儲存 ✓';
  setTimeout(() => { status.textContent = ''; }, 2000);
});

async function load() {
  const s = await getSettings();
  renderServerList(s.serverUrls?.length ? s.serverUrls : ['']);
  ($<HTMLInputElement>('targetLang')).value = s.targetLang;

  const primaryUrl = s.serverUrls?.[0];
  if (primaryUrl) {
    await loadModels(primaryUrl, s.provider, s.model);
  }
}

load();
