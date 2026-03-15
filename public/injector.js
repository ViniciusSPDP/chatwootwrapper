(function () {
  console.log('🚀 S4R41VA SaaS Wrapper: Started...');

  const BASE_URL = 'https://wrapper.s4r41va.com'; // Ajuste conforme necessário
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
        display: none; justify-content: flex-end;
      }
      #saas-panel-overlay.visible { display: flex; }
      
      #saas-panel {
        background: white; width: 450px; max-width: 100%; height: 100%;
        box-shadow: -5px 0 15px rgba(0,0,0,0.1);
        display: flex; flex-direction: column;
        transform: translateX(100%); transition: transform 0.3s ease-out, width 0.3s ease-out;
      }
      #saas-panel-overlay.visible #saas-panel { transform: translateX(0); }

      /* Fullscreen mode (leaving sidebar space) */
      #saas-panel-overlay.fullscreen #saas-panel {
        width: calc(100vw - 260px); /* fallback sidebar width */
        left: 260px;
        position: absolute;
      }

      #saas-iframe { flex: 1; border: none; width: 100%; height: 100%; }
      
      .saas-panel-header {
        padding: 16px 20px; 
        border-bottom: 1px solid #e5e7eb;
        display: flex; justify-content: space-between; align-items: center;
        background: white;
      }
      .saas-panel-title {
        margin: 0; font-size: 1.125rem; font-weight: 600; color: #111827;
        font-family: inherit;
      }
      .saas-close-btn {
        background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;
        display: flex; align-items: center; justify-content: center;
        width: 32px; height: 32px; border-radius: 6px; transition: all 0.2s;
      }
      .saas-close-btn:hover { background-color: #f3f4f6; color: #111827; }
      
      /* Dark Mode Support (Chatwoot usually adds .dark to body or html) */
      .dark #saas-panel { background-color: #1f2937; }
      .dark .saas-panel-header { background-color: #1f2937; border-bottom-color: #374151; }
      .dark .saas-panel-title { color: #f9fafb; }
      .dark .saas-close-btn { color: #9ca3af; }
      .dark .saas-close-btn:hover { background-color: #374151; color: #f9fafb; }
      

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

  function getSidebarWidth() {
    var aside = document.querySelector('aside.bg-n-solid-2, aside[class*="bg-n-solid"], aside.border-r, aside');
    if (aside) {
      return aside.getBoundingClientRect().right;
    }
    return 260; // default fallback
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
            <h3 class="saas-panel-title">Agendamento</h3>
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

  async function openPanel(page, isFullScreen = false) {
    createPanel();
    const overlay = document.getElementById('saas-panel-overlay');
    const iframe = document.getElementById('saas-iframe');
    const panel = document.getElementById('saas-panel');
    const auth = getAuthFromCookie();

    if (!auth) {
      alert('Authentication error (Cookie not found)');
      return;
    }

    // Handle Title and Layout
    const headerTitle = document.querySelector('.saas-panel-title');
    if (headerTitle) {
      headerTitle.textContent = page === 'campaign' ? 'Envio em Massa' : 'Agendamento';
    }

    if (isFullScreen) {
      overlay.classList.add('fullscreen');
      const sidebarWidth = getSidebarWidth();
      panel.style.width = `calc(100vw - ${sidebarWidth}px)`;
      panel.style.left = `${sidebarWidth}px`;
    } else {
      overlay.classList.remove('fullscreen');
      panel.style.width = '';
      panel.style.left = '';
    }

    // Check Dark Mode
    const isDark = document.documentElement.classList.contains('dark') || document.body.classList.contains('dark');

    // 1. Tenta pegar o Account ID da URL (Mais confiável para o contexto atual)
    let accountId = null;
    const urlMatch = window.location.pathname.match(/\/app\/accounts\/(\d+)/);
    if (urlMatch) {
      accountId = urlMatch[1];
      console.log('[SaaS Wrapper] Account ID detectado na URL:', accountId);
    }

    // 2. Fetch Profile (para validar token e obter fallback se necessário)
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
        if (!accountId) {
          if (data.accounts && data.accounts.length > 0) {
            accountId = data.accounts[0].id;
          } else if (data.account_id) {
            accountId = data.account_id;
          }
        }
      }
    } catch (e) {
      console.error('[SaaS Wrapper] Failed to fetch profile:', e);
    }

    // Fallback final
    if (!accountId) accountId = 1;

    const conversationId = getConversationIdFromUrl();

    // Construct URL with params
    const params = new URLSearchParams({
      token: auth.token,
      accountId: accountId.toString(),
      client: auth.client,
      uid: auth.uid,
      chatwootUrl: window.location.origin,
      theme: isDark ? 'dark' : 'light'
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
      // Pass isFullScreen true if page is 'campaign'
      openPanel(page, page === 'campaign');
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
    const iconCampaign = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>`;

    addSidebarItem(MENU_LABEL_SCHEDULE, iconSchedule, 'saas-schedule-btn', 'schedule');
    addSidebarItem('Envio em Massa', iconCampaign, 'saas-campaign-btn', 'campaign');

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
      // Ajustes de espaçamento manuais para garantir que não fique colado ou cortado
      btn.style.marginLeft = '8px';
      btn.style.marginRight = '8px';

      // Forçar bordas arredondadas (caso esteja herdando classe de grupo que remove borda)
      btn.style.borderRadius = '8px';
      // Remover arredondamentos parciais comuns em grupos (ex: rounded-r-md)
      btn.style.borderTopLeftRadius = '8px';
      btn.style.borderBottomLeftRadius = '8px';
      btn.style.borderTopRightRadius = '8px';
      btn.style.borderBottomRightRadius = '8px';
    } else {
      // Fallback de estilo se não tiver irmão (improvável se achou container)
      btn.style.cssText = "display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; color: inherit; margin-left: 8px; margin-right: 8px;";
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
