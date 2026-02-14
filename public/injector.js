<script>
(function() {
  'use strict';

  // ⚠️ CONFIGURAÇÃO: URL do seu Wrapper
  const SAAS_API_URL = 'https://qpassa-chatwootwrapper.v1dvzt.easypanel.host/api/schedule';

  console.log('🚀 Chatwoot Scheduler: Iniciado...');

  var currentConversationId = null;
  var observer = null;
  var lastUrl = location.href;

  // 1. AUTH
  function getAuthFromCookie() {
    var cookies = document.cookie.split(';');
    for (var i = 0; i < cookies.length; i++) {
      var cookie = cookies[i].trim();
      if (cookie.indexOf('cw_d_session_info=') === 0) {
        try {
          var value = cookie.substring('cw_d_session_info='.length);
          var parsed = JSON.parse(decodeURIComponent(value));
          if (parsed['access-token'] && parsed['uid']) {
            return { token: parsed['access-token'], client: parsed['client'], uid: parsed['uid'], accountId: 1 };
          }
        } catch (e) {}
      }
    }
    return null;
  }

  function getConversationIdFromUrl() {
    var match = location.pathname.match(/\/conversations\/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  // 2. CSS
  function injectCSS() {
    if (document.getElementById('cw-scheduler-css')) return;
    var css = document.createElement('style');
    css.id = 'cw-scheduler-css';
    css.textContent = `
      #cw-scheduler-btn { display: inline-flex; align-items: center; justify-content: center; min-width: 32px; height: 32px; gap: 4px; padding: 0 8px; border-radius: 8px; background: rgba(16, 185, 129, 0.1); color: #10B981; font-size: 14px; font-weight: 600; cursor: pointer; border:none; margin-left: 8px; transition:0.2s; }
      #cw-scheduler-btn:hover { background: rgba(16, 185, 129, 0.2); }
      #cw-scheduler-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: none; align-items: center; justify-content: center; z-index: 9999; }
      #cw-scheduler-overlay.visible { display: flex; }
      #cw-scheduler-modal { background: #fff; width: 90%; max-width: 420px; border-radius: 12px; box-shadow: 0 20px 25px rgba(0,0,0,0.1); overflow: hidden; font-family: system-ui, -apple-system, sans-serif; }
      .cw-modal-header { padding: 16px 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
      .cw-modal-content { padding: 20px; }
      .cw-input, .cw-textarea { width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; margin-bottom: 15px; display:block; box-sizing:border-box; }
      .cw-textarea { height: 100px; }
      .cw-actions { display: flex; justify-content: flex-end; gap: 10px; }
      .cw-btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-weight: 500; }
      .cw-btn-save { background: #10B981; color: white; }
    `;
    document.head.appendChild(css);
  }

  // 3. BOTÃO
  function createHeaderButton() {
    if (document.getElementById('cw-scheduler-btn')) return true;
    
    // Tenta achar o container
    var actionsContainer = document.querySelector('.conversation-header .actions-container');
    
    // Fallback: Procura botões se o seletor falhar
    if (!actionsContainer) {
       var btns = document.querySelectorAll('button');
       for(var i=0; i<btns.length; i++) {
         var r = btns[i].getBoundingClientRect();
         if(r.top < 150 && r.left > window.innerWidth/2 && btns[i].parentElement.children.length > 1) {
            actionsContainer = btns[i].parentElement;
            break;
         }
       }
    }

    if (!actionsContainer) return false;

    var btn = document.createElement('button');
    btn.id = 'cw-scheduler-btn';
    btn.innerHTML = '<span>🕒</span><span>Agendar</span>';
    btn.onclick = function(e) { e.preventDefault(); openModal(); };

    if (actionsContainer.firstChild) actionsContainer.insertBefore(btn, actionsContainer.firstChild);
    else actionsContainer.appendChild(btn);
    return true;
  }

  // 4. MODAL
  function createModal() {
    if (document.getElementById('cw-scheduler-overlay')) return;
    var html = `<div id="cw-scheduler-overlay"><div id="cw-scheduler-modal"><div class="cw-modal-header"><h3>📅 Agendar</h3><button onclick="document.getElementById('cw-scheduler-overlay').classList.remove('visible')" style="border:none;background:none;font-size:20px;cursor:pointer">&times;</button></div><div class="cw-modal-content"><label>Mensagem</label><textarea id="cw-sched-msg" class="cw-textarea"></textarea><label>Data</label><input type="datetime-local" id="cw-sched-date" class="cw-input"><div class="cw-actions"><button class="cw-btn" onclick="document.getElementById('cw-scheduler-overlay').classList.remove('visible')">Cancelar</button><button class="cw-btn cw-btn-save" id="cw-sched-submit">Agendar</button></div></div></div></div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('cw-sched-submit').onclick = submitSchedule;
  }

  function openModal() {
    createModal();
    document.getElementById('cw-scheduler-overlay').classList.add('visible');
    var now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('cw-sched-date').value = now.toISOString().slice(0, 16);
  }

  async function submitSchedule() {
    var btn = document.getElementById('cw-sched-submit');
    var msg = document.getElementById('cw-sched-msg').value;
    var date = document.getElementById('cw-sched-date').value;
    var auth = getAuthFromCookie();
    var convId = getConversationIdFromUrl();

    if (!auth) return alert('Erro: Logue novamente no Chatwoot');
    
    btn.innerText = '...';
    try {
      var res = await fetch(SAAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, scheduledAt: new Date(date).toISOString(), conversationId: convId, accountId: auth.accountId, chatwootUrl: location.origin, token: auth.token })
      });
      if (res.ok) { alert('Sucesso!'); document.getElementById('cw-scheduler-overlay').classList.remove('visible'); }
      else { alert('Erro ao salvar'); }
    } catch (e) { alert('Erro de conexão'); } finally { btn.innerText = 'Agendar'; }
  }

  // 5. INIT
  function init() {
    injectCSS(); createModal();
    var check = () => { if(getConversationIdFromUrl()) createHeaderButton(); };
    window.addEventListener('popstate', check);
    document.addEventListener('click', () => setTimeout(check, 200));
    setInterval(check, 1000); 
  }
  
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
</script>