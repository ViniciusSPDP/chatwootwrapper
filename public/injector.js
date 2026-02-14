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
            client: parsed['client'],
            accountId: 1 // Default, can be dynamic
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

  function openPanel(page) {
    createPanel();
    const overlay = document.getElementById('saas-panel-overlay');
    const iframe = document.getElementById('saas-iframe');
    const auth = getAuthFromCookie();

    if (!auth) {
      alert('Authentication error (Cookie not found)');
      return;
    }

    const conversationId = getConversationIdFromUrl();

    // Construct URL with params
    const params = new URLSearchParams({
      token: auth.token,
      accountId: auth.accountId,
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
    addSidebarItem(MENU_LABEL_FOLLOWUP, iconFollowup, 'saas-followup-btn', 'followup');
  }

  // ============================================================
  // 5. INJEÇÃO WIDGET NA CONVERSA
  // ============================================================
  function injectConversationWidget() {
    const observer = new MutationObserver(() => {
      const header = document.querySelector('.conversation-header .actions-container')
        || document.querySelector('.conversation--header');

      if (header && !document.getElementById('saas-floating-widget')) {
        const btn = document.createElement('button');
        btn.id = 'saas-floating-widget';
        btn.innerHTML = `<span>📅</span> Agendar`;
        btn.onclick = () => openPanel('schedule');

        if (header.firstChild) header.insertBefore(btn, header.firstChild);
        else header.appendChild(btn);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
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

    injectConversationWidget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
