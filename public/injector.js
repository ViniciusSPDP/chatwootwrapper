(function() {
  console.log('🚀 Chatwoot Wrapper: Frontend V1 Iniciado...');

  const SAAS_API_URL = 'https://qpassa-chatwootwrapper.v1dvzt.easypanel.host/api/schedule';

  // ============================================================
  // 1. ESTILOS CSS (Injetados no Head)
  // ============================================================
  function injectStyles() {
    if (document.getElementById('saas-wrapper-css')) return;
    const style = document.createElement('style');
    style.id = 'saas-wrapper-css';
    style.textContent = `
      /* Overlay do Modal */
      .saas-modal-overlay {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.5); z-index: 9999;
        display: flex; align-items: center; justify-content: center;
        opacity: 0; visibility: hidden; transition: all 0.2s;
      }
      .saas-modal-overlay.open { opacity: 1; visibility: visible; }

      /* O Modal em si */
      .saas-modal-content {
        background: white; width: 400px; padding: 24px; border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.1); font-family: -apple-system, sans-serif;
        transform: scale(0.95); transition: transform 0.2s;
      }
      .saas-modal-overlay.open .saas-modal-content { transform: scale(1); }

      /* Elementos do Form */
      .saas-h2 { margin: 0 0 16px 0; font-size: 18px; color: #1f2937; }
      .saas-label { display: block; font-size: 14px; color: #4b5563; margin-bottom: 6px; }
      .saas-input, .saas-textarea {
        width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;
        margin-bottom: 16px; font-size: 14px; box-sizing: border-box;
      }
      .saas-textarea { height: 100px; resize: vertical; }

      /* Botões */
      .saas-actions { display: flex; justify-content: flex-end; gap: 10px; }
      .saas-btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-weight: 500; }
      .saas-btn-cancel { background: #f3f4f6; color: #374151; }
      .saas-btn-save { background: #10B981; color: white; }
      .saas-btn-save:disabled { background: #a7f3d0; cursor: not-allowed; }
    `;
    document.head.appendChild(style);
  }

  // ============================================================
  // 2. LÓGICA DE AUTENTICAÇÃO (Roubar Cookie do Chatwoot)
  // ============================================================
  function getAuthFromCookie() {
    // Procura o cookie específico do Chatwoot
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.startsWith('cw_d_session_info=')) {
        try {
          const value = cookie.substring('cw_d_session_info='.length);
          const parsed = JSON.parse(decodeURIComponent(value));
          // Retorna os dados que precisamos
          return {
            token: parsed['access-token'],
            uid: parsed['uid'],
            client: parsed['client'],
            accountId: 1 // TODO: Tentar pegar da URL se possível, ou usar default
          };
        } catch (e) {
          console.error('Erro ao ler cookie', e);
        }
      }
    }
    // Fallback: Se não achar cookie, retorna null
    return null;
  }

  // ============================================================
  // 3. CONSTRUÇÃO DO MODAL
  // ============================================================
  function createModal() {
    if (document.getElementById('saas-schedule-modal')) return;

    const modalHTML = `
      <div class="saas-modal-overlay" id="saas-schedule-modal">
        <div class="saas-modal-content">
          <h2 class="saas-h2">📅 Agendar Mensagem</h2>
          
          <label class="saas-label">Mensagem:</label>
          <textarea id="saas-msg-text" class="saas-textarea" placeholder="Digite sua mensagem aqui..."></textarea>
          
          <label class="saas-label">Data e Hora:</label>
          <input type="datetime-local" id="saas-msg-date" class="saas-input">

          <div class="saas-actions">
            <button class="saas-btn saas-btn-cancel" id="saas-btn-close">Cancelar</button>
            <button class="saas-btn saas-btn-save" id="saas-btn-submit">Agendar Envio</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Event Listeners do Modal
    document.getElementById('saas-btn-close').onclick = closeModal;
    document.getElementById('saas-schedule-modal').onclick = (e) => {
      if (e.target.id === 'saas-schedule-modal') closeModal();
    };
    document.getElementById('saas-btn-submit').onclick = submitSchedule;
  }

  function openModal() {
    createModal(); // Garante que existe
    const modal = document.getElementById('saas-schedule-modal');
    modal.classList.add('open');
    
    // Define data mínima como "Agora"
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('saas-msg-date').value = now.toISOString().slice(0, 16);
  }

  function closeModal() {
    const modal = document.getElementById('saas-schedule-modal');
    if (modal) modal.classList.remove('open');
  }

  // ============================================================
  // 4. ENVIO PARA API (O fetch)
  // ============================================================
  async function submitSchedule() {
    const btn = document.getElementById('saas-btn-submit');
    const text = document.getElementById('saas-msg-text').value;
    const date = document.getElementById('saas-msg-date').value;
    const auth = getAuthFromCookie();
    const conversationId = window.location.pathname.match(/\/conversations\/(\d+)/)?.[1];

    if (!text || !date) return alert('Preencha todos os campos!');
    if (!auth) return alert('Erro de autenticação: Não consegui ler o cookie do Chatwoot.');

    try {
      btn.innerText = 'Enviando...';
      btn.disabled = true;

      const payload = {
        message: text,
        scheduledAt: new Date(date).toISOString(),
        conversationId: parseInt(conversationId),
        accountId: auth.accountId, 
        chatwootUrl: window.location.origin, // Pega a URL atual (ex: app.chatwoot.com)
        token: auth.token // Token roubado do cookie
      };

      const res = await fetch(SAAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok) {
        alert('✅ Mensagem agendada com sucesso!');
        closeModal();
        document.getElementById('saas-msg-text').value = ''; // Limpa
      } else {
        alert('Erro: ' + (data.error || 'Falha desconhecida'));
      }

    } catch (err) {
      console.error(err);
      alert('Erro de conexão com o servidor SaaS.');
    } finally {
      btn.innerText = 'Agendar Envio';
      btn.disabled = false;
    }
  }

  // ============================================================
  // 5. INJEÇÃO DO BOTÃO (Lógica anterior melhorada)
  // ============================================================
  let observer = null;

  function startObserver() {
    injectStyles(); // Já garante o CSS

    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      const header = document.querySelector('.conversation-header .actions-container') 
                  || document.querySelector('.conversation--header');
      
      if (header && !document.getElementById('saas-wrapper-btn')) {
        const btn = document.createElement('button');
        btn.id = 'saas-wrapper-btn';
        btn.innerHTML = '🕒 Agendar';
        btn.style.cssText = `
          background: #10B981; color: white; border: none; padding: 6px 12px;
          border-radius: 6px; margin-left: 8px; cursor: pointer; font-weight: 600;
          display: inline-flex; align-items: center; gap: 5px;
        `;
        btn.onclick = openModal;
        
        // Insere no início dos botões
        if (header.firstChild) header.insertBefore(btn, header.firstChild);
        else header.appendChild(btn);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Start
  startObserver();

})();