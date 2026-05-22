import { getSettings, getSiteRules, saveSiteRules } from '../../lib/storage';
import type { ApplySiteRuleMessage } from '../../lib/types';

async function init() {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ?? '';
  const domainLabel = document.getElementById('domain-label')!;
  const mainContent = document.getElementById('main-content')!;

  // Handle non-http URLs
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    domainLabel.textContent = '';
    mainContent.innerHTML = '<div class="unavailable">此頁面無法使用翻譯</div>';
    return;
  }

  const parsed = new URL(url);
  const domain = parsed.hostname;
  const pageKey = parsed.origin + parsed.pathname;

  domainLabel.textContent = domain;

  const siteRules = await getSiteRules();
  const settings = await getSettings();

  const domainBehavior = siteRules.domains[domain] ?? null;
  const isSkipped = siteRules.skipUrls.includes(pageKey);

  // Determine active rule
  let activeRule: 'always' | 'skip' | 'never' | null = null;
  if (domainBehavior === 'never') activeRule = 'never';
  else if (isSkipped) activeRule = 'skip';
  else if (domainBehavior === 'always') activeRule = 'always';

  const statusMessages: Record<string, string> = {
    always: `此網域將自動翻譯`,
    skip: `此頁面已略過自動翻譯`,
    never: `此網域已停用翻譯`,
  };

  const statusText = activeRule ? statusMessages[activeRule] : `使用右下角按鈕手動翻譯`;

  mainContent.innerHTML = `
    <div class="rule-buttons">
      <button class="rule-btn${activeRule === 'always' ? ' active' : ''}" id="btn-always">一律翻譯</button>
      <button class="rule-btn${activeRule === 'skip' ? ' active' : ''}" id="btn-skip">略過此頁面</button>
      <button class="rule-btn${activeRule === 'never' ? ' active' : ''}" id="btn-never">一律不要翻譯</button>
    </div>
    <div class="status-text" id="status-text">${statusText}</div>
    <hr class="divider" />
    <a class="footer-link" id="open-options">開啟設定</a>
  `;

  document.getElementById('open-options')?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  async function applyRule(behavior: 'always' | 'skip' | 'never' | 'default') {
    const rules = await getSiteRules();

    if (behavior === 'never') {
      rules.domains[domain] = 'never';
      rules.skipUrls = rules.skipUrls.filter(u => u !== pageKey);
    } else if (behavior === 'always') {
      rules.domains[domain] = 'always';
      rules.skipUrls = rules.skipUrls.filter(u => u !== pageKey);
    } else if (behavior === 'skip') {
      delete rules.domains[domain];
      if (!rules.skipUrls.includes(pageKey)) {
        rules.skipUrls.push(pageKey);
      }
    } else {
      // default: remove all rules for this domain/page
      delete rules.domains[domain];
      rules.skipUrls = rules.skipUrls.filter(u => u !== pageKey);
    }

    await saveSiteRules(rules);

    // Send message to content script
    const msg: ApplySiteRuleMessage = { type: 'apply-site-rule', behavior };
    if (tab?.id != null) {
      chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
    }

    window.close();
  }

  document.getElementById('btn-always')?.addEventListener('click', () => {
    applyRule(activeRule === 'always' ? 'default' : 'always');
  });

  document.getElementById('btn-skip')?.addEventListener('click', () => {
    applyRule(activeRule === 'skip' ? 'default' : 'skip');
  });

  document.getElementById('btn-never')?.addEventListener('click', () => {
    applyRule(activeRule === 'never' ? 'default' : 'never');
  });
}

init().catch(console.error);
