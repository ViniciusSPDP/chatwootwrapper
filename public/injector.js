(function () {
  console.log('🚀 S4R41VA SaaS Wrapper: Started...');

  const BASE_URL = 'https://qpassa-chatwootwrapper.v1dvzt.easypanel.host'; // Ajuste conforme necessário
  const MENU_LABEL_SCHEDULE = 'Agendar';
  const MENU_LABEL_FOLLOWUP = 'Follow-up';

  // ============================================================
  // 1. ESTILOS CSS
  // ============================================================
  function injectStyles() {
    if (document.getElementById('saas-wrapper-css')) return;
    const style = document.createElement('style');
    style.id = 'saas-wrapper-css';
    style.textContent = `
      /* Sidebar item spacing */
      #saas-wrapper-menu-schedule, #saas-wrapper-menu-followup { margin-top: 0 !important; margin-bottom: 0 !important; }
      .menu-icon { display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
      .menu-icon svg { width:16px; height:16px; }

      /* Panel/Modal */
      #saas-panel-overlay {
        position: fixed; top: 0; right: 0; bottom: 0; left: 0;
        background: rgba(0, 0, 0, 0.5); z-index: 9999;
        display: none; justify-content: flex-end; /* Sidebar style */
      }
      #saas-panel-overlay.visible { display: flex; }
      
      #saas-panel {
        background: white; width: 500px; max-width: 100%; height: 100%;
        box-shadow: -5px 0 15px rgba(0,0,0,0.1);
        display: flex; flex-direction: column;
        transform: translateX(100%); transition: transform 0.3s ease-out;
      }
      #saas-panel-overlay.visible #saas-panel { transform: translateX(0); }

      #saas-iframe { flex: 1; border: none; width: 100%; height: 100%; }
      
      .saas-panel-header {
        padding: 10px 15px; border-bottom: 1px solid #eee;
        display: flex; justify-content: space-between; align-items: center;
      }
      .saas-close-btn {
        background: none; border: none; font-size: 20px; cursor: pointer; color: #555;
      }
      
      /* Floating Widget Button */
      #saas-floating-widget {
        display: inline-flex; align-items: center; gap: 5px;
        background: #10B981; color: white; border: none; padding: 6px 12px;
        border-radius: 6px; margin-left: 8px; cursor: pointer; font-weight: 600;
      }
      #saas-floating-widget:hover { background: #059669; }
    `;
    document.head.appendChild(style);
  }

  // ============================================================
  // 2. AUTH & UTILS
  // ============================================================
  function getAuthFromCookie() {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.startsWith('cw_d_session_info=')) {
        try {
          const value = cookie.substring('cw_d_session_info='.length);
          const parsed = JSON.parse(decodeURIComponent(value));
          return {
            token: parsed['access-token'],
            uid: parsed['uid'],
            client: parsed['client']
          };
        } catch (e) {
          console.error('[SaaS Wrapper] Cookie parsing error', e);
        }
      }
    }
    return null;
  }



  function getConversationIdFromUrl() {
    const match = window.location.pathname.match(/\/conversations\/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  // ============================================================
  // 3. PAINEL (IFRAME)
  // ============================================================
  function createPanel() {
    if (document.getElementById('saas-panel-overlay')) return;

    const panelHTML = `
      <div id="saas-panel-overlay">
        <div id="saas-panel">
          <div class="saas-panel-header">
            <h3 style="margin:0; font-size:16px;">SaaS Extension</h3>
            <button class="saas-close-btn" id="saas-panel-close">&times;</button>
          </div>
          <iframe id="saas-iframe" src="about:blank"></iframe>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', panelHTML);

    document.getElementById('saas-panel-close').onclick = closePanel;
    document.getElementById('saas-panel-overlay').onclick = (e) => {
      if (e.target.id === 'saas-panel-overlay') closePanel();
    };
  }

  async function openPanel(page) {
    createPanel();
    const overlay = document.getElementById('saas-panel-overlay');
    const iframe = document.getElementById('saas-iframe');
    const auth = getAuthFromCookie();

    if (!auth) {
      alert('Authentication error (Cookie not found)');
      return;
    }

    // Fetch Profile to get Account ID
    let accountId = 1;
    try {
      const res = await fetch(`${BASE_URL}/api/v1/profile`, {
        headers: {
          'api_access_token': auth.token,
          'client': auth.client,
          'uid': auth.uid
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.accounts && data.accounts.length > 0) {
          // Prefer the first active account or just the first one
          accountId = data.accounts[0].id;
        } else if (data.account_id) {
          accountId = data.account_id;
        }
      }
    } catch (e) {
      console.error('[SaaS Wrapper] Failed to fetch profile:', e);
    }

    const conversationId = getConversationIdFromUrl();

    // Construct URL with params
    const params = new URLSearchParams({
      token: auth.token,
      accountId: accountId.toString(),
      client: auth.client,
      uid: auth.uid,
      chatwootUrl: window.location.origin,
    });

    if (conversationId) {
      params.append('conversationId', conversationId);
    }

    const targetUrl = `${BASE_URL}/${page}?${params.toString()}`;

    if (iframe.src !== targetUrl) {
      iframe.src = targetUrl;
    }

    overlay.classList.add('visible');
  }

  function closePanel() {
    const overlay = document.getElementById('saas-panel-overlay');
    if (overlay) overlay.classList.remove('visible');
  }

  // ============================================================
  // 4. INJEÇÃO SIDEBAR
  // ============================================================
  function findMainNav() {
    return (
      document.querySelector('aside nav ul.list-none') ||
      document.querySelector('aside nav > ul') ||
      document.querySelector('nav.grid ul') ||
      document.querySelector('aside ul')
    );
  }

  function addSidebarItem(label, icon, onClickId, page) {
    const mainNav = findMainNav();
    if (!mainNav) return false;

    const itemId = `saas-wrapper-menu-${page}`;
    if (document.getElementById(itemId)) return true;

    // Find reference item (usually Settings)
    const allLi = mainNav.querySelectorAll(':scope > li');
    let refLi = allLi[allLi.length - 1]; // Default to last
    for (let i = 0; i < allLi.length; i++) {
      const text = (allLi[i].textContent || '').toLowerCase();
      if (text.includes('configura') || text.includes('settings')) {
        refLi = allLi[i];
        break;
      }
    }

    const li = document.createElement('li');
    li.className = refLi.className;

    // Copy styles/classes from a valid link inside refLi
    const refLink = refLi.querySelector('a, div[role="button"], button') || refLi;

    const item = document.createElement('div');
    item.id = itemId;
    item.className = refLink.className;
    item.setAttribute('role', 'button');
    item.style.cursor = 'pointer';

    item.innerHTML = `
      <div class="relative flex items-center gap-2">
        <div class="flex items-center gap-1.5 flex-grow min-w-0">
          <span class="menu-icon">${icon}</span>
          <span class="text-sm font-medium leading-5 truncate">${label}</span>
        </div>
      </div>
    `;

    item.onclick = (e) => {
      e.preventDefault();
      openPanel(page);
    };

    li.appendChild(item);

    // Insert before Settings if found, or at end
    if (refLi && refLi.parentNode === mainNav) {
      mainNav.insertBefore(li, refLi);
    } else {
      mainNav.appendChild(li);
    }
    return true;
  }

  function initSidebar() {
    const iconSchedule = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>`;
    const iconFollowup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`;

    addSidebarItem(MENU_LABEL_SCHEDULE, iconSchedule, 'saas-schedule-btn', 'schedule');

  }

  // ============================================================
  // 5. INJEÇÃO WIDGET NA CONVERSA
  // ============================================================
  // ============================================================
  // 5. INJEÇÃO BOTÃO HEADER
  // ============================================================
  function createHeaderButton() {
    if (document.getElementById('saas-floating-widget')) return true;

    // 1. Tenta achar o container de ações (botões 28-40px no topo direito)
    const allButtons = document.querySelectorAll('button');
    let actionsContainer = null;
    let siblingBtn = null;

    for (let i = 0; i < allButtons.length; i++) {
      const btn = allButtons[i];
      const rect = btn.getBoundingClientRect();

      // Critérios: tamanho de ícone e posição à direita
      if (rect.width >= 28 && rect.width <= 40 && rect.height >= 28 && rect.height <= 40) {
        if (rect.left > window.innerWidth * 0.5) { // Está na metade direita da tela
          const parent = btn.parentElement;
          if (parent) {
            const siblings = parent.querySelectorAll(':scope > button');
            // Geralmente o header tem entre 2 e 6 botões
            if (siblings.length >= 2 && siblings.length <= 8) {
              actionsContainer = parent;
              siblingBtn = btn;
              break;
            }
          }
        }
      }
    }

    // 2. Fallback: Procura por texto "Ações da conversa" (se existir em pt-BR)
    if (!actionsContainer) {
      const allSpans = document.querySelectorAll('span');
      for (let j = 0; j < allSpans.length; j++) {
        if (allSpans[j].textContent.trim() === 'Ações da conversa' || allSpans[j].textContent.trim() === 'Conversation actions') {
          const section = allSpans[j].closest('div');
          if (section && section.parentElement) {
            const parentDiv = section.parentElement;
            // Procura container de botões acima do título
            const divsAbove = parentDiv.querySelectorAll('div');
            for (let k = 0; k < divsAbove.length; k++) {
              const btns = divsAbove[k].querySelectorAll(':scope > button');
              if (btns.length >= 2) {
                actionsContainer = divsAbove[k];
                siblingBtn = btns[0];
                break;
              }
            }
          }
          break;
        }
      }
    }

    if (!actionsContainer) return false;

    // Criar o botão
    const btn = document.createElement('button');
    btn.id = 'saas-floating-widget';
    btn.title = 'Agendar Mensagem';

    // Copiar classes do irmão para parecer nativo
    if (siblingBtn) {
      btn.className = siblingBtn.className;
    } else {
      // Fallback de estilo se não tiver irmão (improvável se achou container)
      btn.style.cssText = "display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; color: inherit;";
    }

    // Ícone de Calendário
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPanel('schedule');
    };

    // Inserir como primeiro ícone (ou último, dependendo da preferência)
    // Aqui inserimos no início para destaque
    if (actionsContainer.firstChild) {
      actionsContainer.insertBefore(btn, actionsContainer.firstChild);
    } else {
      actionsContainer.appendChild(btn);
    }

    return true;
  }

  function monitorHeaderConfig() {
    const observer = new MutationObserver(() => {
      createHeaderButton();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Tenta criar imediatamente também
    createHeaderButton();
  }

  // ============================================================
  // INIT
  // ============================================================
  function init() {
    injectStyles();
    createPanel();

    // Retry adding sidebar items
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      initSidebar();
      if (attempts > 20) clearInterval(interval);
    }, 1000);

    monitorHeaderConfig();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
