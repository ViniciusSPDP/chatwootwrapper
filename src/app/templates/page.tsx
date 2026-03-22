'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

interface WhatsAppInbox {
  id: number;
  name: string;
  channel_type: string;
  phone_number?: string;
  provider_config?: {
    business_account_id?: string;
    phone_number_id?: string;
  };
}

interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phone_number?: string;
}

interface TemplateForm {
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  headerType: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  headerText: string;
  body: string;
  footer: string;
  buttons: TemplateButton[];
}

const LANGUAGES = [
  { code: 'pt_BR', label: 'Português (Brasil)' },
  { code: 'pt_PT', label: 'Português (Portugal)' },
  { code: 'en_US', label: 'English (US)' },
  { code: 'en_GB', label: 'English (UK)' },
  { code: 'es', label: 'Español' },
  { code: 'es_AR', label: 'Español (Argentina)' },
  { code: 'es_MX', label: 'Español (México)' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'zh_CN', label: '中文 (简体)' },
  { code: 'ar', label: 'العربية' },
];

const EMPTY_FORM: TemplateForm = {
  name: '',
  category: 'MARKETING',
  language: 'pt_BR',
  headerType: 'NONE',
  headerText: '',
  body: '',
  footer: '',
  buttons: [],
};

function TemplatesPageContent() {
  const searchParams = useSearchParams();
  const accountId = searchParams.get('accountId') || '';
  const token = searchParams.get('token') || '';
  const chatwootUrl = searchParams.get('chatwootUrl') || '';
  const client = searchParams.get('client') || '';
  const uid = searchParams.get('uid') || '';
  const isDark = searchParams.get('theme') === 'dark';

  const [inboxes, setInboxes] = useState<WhatsAppInbox[]>([]);
  const [selectedInboxId, setSelectedInboxId] = useState<number | null>(null);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingInboxes, setLoadingInboxes] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [existingTemplates, setExistingTemplates] = useState<Record<string, unknown>[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Carregar credenciais salvas
  useEffect(() => {
    const savedWaba = localStorage.getItem('saas_waba_id') || '';
    const savedToken = localStorage.getItem('saas_meta_token') || '';
    if (savedWaba) setWabaId(savedWaba);
    if (savedToken) setAccessToken(savedToken);
  }, []);

  // Buscar inboxes WhatsApp
  useEffect(() => {
    if (!accountId || !token || !chatwootUrl) return;
    fetchInboxes();
  }, [accountId, token, chatwootUrl]);

  // Buscar templates ao selecionar inbox / quando credenciais mudarem
  useEffect(() => {
    if (wabaId && accessToken) {
      fetchExistingTemplates();
    }
  }, [wabaId, accessToken]);

  async function fetchInboxes() {
    setLoadingInboxes(true);
    try {
      const res = await fetch(
        `/api/chatwoot/inboxes?accountId=${accountId}&token=${encodeURIComponent(token)}&chatwootUrl=${encodeURIComponent(chatwootUrl)}&client=${encodeURIComponent(client)}&uid=${encodeURIComponent(uid)}`
      );
      const data = await res.json();
      if (data.success) {
        const wa = (data.data as WhatsAppInbox[]).filter(
          (i) => i.channel_type === 'Channel::Whatsapp'
        );
        setInboxes(wa);
        if (wa.length > 0) {
          setSelectedInboxId(wa[0].id);
          // Tenta preencher WABA ID automaticamente da config do inbox
          const wabaFromInbox = wa[0].provider_config?.business_account_id;
          if (wabaFromInbox && !wabaId) setWabaId(wabaFromInbox);
        }
      }
    } catch {
      showToast('error', 'Erro ao buscar caixas de entrada');
    } finally {
      setLoadingInboxes(false);
    }
  }

  async function fetchExistingTemplates() {
    if (!wabaId || !accessToken) return;
    setLoadingTemplates(true);
    try {
      const res = await fetch(
        `/api/whatsapp/templates?waba_id=${encodeURIComponent(wabaId)}&access_token=${encodeURIComponent(accessToken)}`
      );
      const data = await res.json();
      if (data.success) {
        setExistingTemplates(data.data || []);
      }
    } catch {
      // Silencioso — credenciais podem estar incorretas
    } finally {
      setLoadingTemplates(false);
    }
  }

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  function saveCredentials() {
    localStorage.setItem('saas_waba_id', wabaId);
    localStorage.setItem('saas_meta_token', accessToken);
    showToast('success', 'Credenciais salvas!');
    fetchExistingTemplates();
  }

  function addButton() {
    if (form.buttons.length >= 3) return;
    setForm((f) => ({ ...f, buttons: [...f.buttons, { type: 'QUICK_REPLY', text: '' }] }));
  }

  function removeButton(idx: number) {
    setForm((f) => ({ ...f, buttons: f.buttons.filter((_, i) => i !== idx) }));
  }

  function updateButton(idx: number, field: keyof TemplateButton, value: string) {
    setForm((f) => {
      const btns = [...f.buttons];
      btns[idx] = { ...btns[idx], [field]: value } as TemplateButton;
      return { ...f, buttons: btns };
    });
  }

  function buildComponents() {
    const components: Record<string, unknown>[] = [];

    if (form.headerType !== 'NONE') {
      if (form.headerType === 'TEXT') {
        components.push({ type: 'HEADER', format: 'TEXT', text: form.headerText });
      } else {
        components.push({ type: 'HEADER', format: form.headerType, example: { header_handle: ['PLACEHOLDER'] } });
      }
    }

    if (form.body) {
      // Detectar variáveis para exemplo
      const varMatches = form.body.match(/\{\{(\d+)\}\}/g) || [];
      const exampleVars = varMatches.map(() => 'exemplo');
      const bodyComp: Record<string, unknown> = { type: 'BODY', text: form.body };
      if (exampleVars.length > 0) {
        bodyComp.example = { body_text: [exampleVars] };
      }
      components.push(bodyComp);
    }

    if (form.footer) {
      components.push({ type: 'FOOTER', text: form.footer });
    }

    if (form.buttons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: form.buttons.map((b) => {
          if (b.type === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: b.text };
          if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url || '' };
          return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number || '' };
        }),
      });
    }

    return components;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.body) {
      showToast('error', 'Nome e corpo do template são obrigatórios');
      return;
    }
    if (!wabaId || !accessToken) {
      showToast('error', 'Informe o WABA ID e o Token de acesso Meta');
      return;
    }

    const nameClean = form.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (nameClean !== form.name) {
      setForm((f) => ({ ...f, name: nameClean }));
    }

    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waba_id: wabaId,
          access_token: accessToken,
          template: {
            name: nameClean,
            language: form.language,
            category: form.category,
            components: buildComponents(),
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', `Template "${nameClean}" criado! ID: ${data.id}`);
        setForm(EMPTY_FORM);
        setShowForm(false);
        fetchExistingTemplates();
      } else {
        showToast('error', data.error || 'Erro ao criar template');
      }
    } catch {
      showToast('error', 'Erro de conexão ao criar template');
    } finally {
      setLoading(false);
    }
  }

  // Preview renderiza o template estilo WhatsApp
  function renderPreview() {
    const bodyPreview = form.body.replace(/\{\{(\d+)\}\}/g, (_, n) => `[variável ${n}]`);
    return (
      <div
        className="rounded-2xl p-4 max-w-xs shadow-md text-sm"
        style={{ backgroundColor: '#dcf8c6', color: '#111' }}
      >
        {form.headerType === 'TEXT' && form.headerText && (
          <p className="font-bold mb-2 text-base">{form.headerText}</p>
        )}
        {form.headerType !== 'NONE' && form.headerType !== 'TEXT' && (
          <div
            className="rounded-lg mb-2 flex items-center justify-center text-xs text-gray-500"
            style={{ background: '#b2dfdb', height: 80 }}
          >
            [{form.headerType}]
          </div>
        )}
        <p className="whitespace-pre-wrap leading-relaxed">{bodyPreview || 'Corpo do template...'}</p>
        {form.footer && <p className="mt-2 text-xs" style={{ color: '#777' }}>{form.footer}</p>}
        {form.buttons.length > 0 && (
          <div className="mt-3 border-t pt-2 flex flex-col gap-1" style={{ borderColor: '#aed581' }}>
            {form.buttons.map((b, i) => (
              <button
                key={i}
                className="w-full text-center py-1 rounded-lg text-sm font-medium"
                style={{ backgroundColor: '#25d366', color: '#fff' }}
              >
                {b.text || `Botão ${i + 1}`}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const dark = isDark;
  const bg = dark ? '#111827' : '#f9fafb';
  const card = dark ? '#1f2937' : '#ffffff';
  const border = dark ? '#374151' : '#e5e7eb';
  const text = dark ? '#f9fafb' : '#111827';
  const sub = dark ? '#9ca3af' : '#6b7280';
  const inputBg = dark ? '#374151' : '#ffffff';
  const inputBorder = dark ? '#4b5563' : '#d1d5db';
  const labelColor = dark ? '#d1d5db' : '#374151';

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: `1px solid ${inputBorder}`, background: inputBg,
    color: text, fontSize: 14, outline: 'none',
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
    color: sub, textTransform: 'uppercase', marginBottom: 8,
  };

  if (loadingInboxes) {
    return (
      <div style={{ background: bg, color: text, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: sub }}>Carregando caixas de entrada...</p>
      </div>
    );
  }

  if (inboxes.length === 0) {
    return (
      <div style={{ background: bg, color: text, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#25d366" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        <p style={{ color: text, fontWeight: 600, fontSize: 16 }}>Nenhuma caixa WhatsApp API encontrada</p>
        <p style={{ color: sub, textAlign: 'center', maxWidth: 360, fontSize: 14 }}>
          Este recurso está disponível apenas para contas com caixas de entrada da API oficial do WhatsApp (Meta Cloud API).
        </p>
      </div>
    );
  }

  return (
    <div style={{ background: bg, color: text, minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'inherit' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          padding: '12px 20px', borderRadius: 10, fontWeight: 600,
          background: toast.type === 'success' ? '#16a34a' : '#dc2626',
          color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          maxWidth: 340, fontSize: 14,
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: `1px solid ${border}`, background: card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#25d366" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Templates WhatsApp</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            value={selectedInboxId ?? ''}
            onChange={(e) => setSelectedInboxId(Number(e.target.value))}
            style={{ ...inputStyle, width: 'auto', paddingRight: 28 }}
          >
            {inboxes.map((i) => (
              <option key={i.id} value={i.id}>{i.name} {i.phone_number ? `(${i.phone_number})` : ''}</option>
            ))}
          </select>
          <button
            onClick={() => setShowForm(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#25d366', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Novo Template
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Credenciais Meta */}
        <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: 20 }}>
          <p style={sectionTitle}>Credenciais Meta (WhatsApp Business)</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: 12, color: labelColor, display: 'block', marginBottom: 4 }}>WABA ID (WhatsApp Business Account)</label>
              <input
                type="text"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                placeholder="Ex: 123456789012345"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: labelColor, display: 'block', marginBottom: 4 }}>Token de Acesso Meta (System User)</label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="EAAxxxxxxxx..."
                style={inputStyle}
              />
            </div>
            <button
              onClick={saveCredentials}
              style={{ padding: '8px 16px', borderRadius: 8, background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' }}
            >
              Salvar
            </button>
          </div>
          <p style={{ fontSize: 11, color: sub, marginTop: 8 }}>
            As credenciais são salvas apenas no seu navegador (localStorage). Necessário para criar e listar templates via Meta Graph API.
          </p>
        </div>

        {/* Lista de templates existentes */}
        {wabaId && accessToken && (
          <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={sectionTitle}>Templates Existentes</p>
              <button
                onClick={fetchExistingTemplates}
                style={{ fontSize: 12, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {loadingTemplates ? 'Carregando...' : 'Atualizar'}
              </button>
            </div>
            {loadingTemplates ? (
              <p style={{ color: sub, fontSize: 14 }}>Carregando templates...</p>
            ) : existingTemplates.length === 0 ? (
              <p style={{ color: sub, fontSize: 14 }}>Nenhum template encontrado. Crie o primeiro!</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {existingTemplates.map((t, i) => {
                  const tpl = t as { name?: string; status?: string; category?: string; language?: string };
                  const statusColor = tpl.status === 'APPROVED' ? '#16a34a' : tpl.status === 'REJECTED' ? '#dc2626' : '#d97706';
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: `1px solid ${border}` }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{tpl.name}</span>
                        <span style={{ marginLeft: 8, fontSize: 12, color: sub }}>{tpl.language} · {tpl.category}</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, background: `${statusColor}18`, padding: '2px 10px', borderRadius: 20 }}>
                        {tpl.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Formulário de criação */}
        {showForm && (
          <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <p style={{ ...sectionTitle, marginBottom: 0 }}>Criar Novo Template</p>
              <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: sub, fontSize: 20, lineHeight: 1 }}>×</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                {/* Coluna esquerda — Formulário */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* Nome, categoria, idioma */}
                  <div>
                    <label style={{ fontSize: 12, color: labelColor, display: 'block', marginBottom: 4 }}>Nome do Template *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))}
                      placeholder="ex: boas_vindas_cliente"
                      required
                      style={inputStyle}
                    />
                    <p style={{ fontSize: 11, color: sub, marginTop: 4 }}>Apenas letras minúsculas, números e underscores.</p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 12, color: labelColor, display: 'block', marginBottom: 4 }}>Categoria</label>
                      <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as TemplateForm['category'] }))} style={inputStyle}>
                        <option value="MARKETING">Marketing</option>
                        <option value="UTILITY">Utilidade</option>
                        <option value="AUTHENTICATION">Autenticação</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: labelColor, display: 'block', marginBottom: 4 }}>Idioma</label>
                      <select value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))} style={inputStyle}>
                        {LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>{l.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Cabeçalho */}
                  <div>
                    <label style={{ fontSize: 12, color: labelColor, display: 'block', marginBottom: 4 }}>Cabeçalho (opcional)</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select value={form.headerType} onChange={(e) => setForm((f) => ({ ...f, headerType: e.target.value as TemplateForm['headerType'], headerText: '' }))} style={{ ...inputStyle, width: 'auto' }}>
                        <option value="NONE">Nenhum</option>
                        <option value="TEXT">Texto</option>
                        <option value="IMAGE">Imagem</option>
                        <option value="VIDEO">Vídeo</option>
                        <option value="DOCUMENT">Documento</option>
                      </select>
                      {form.headerType === 'TEXT' && (
                        <input
                          type="text"
                          value={form.headerText}
                          onChange={(e) => setForm((f) => ({ ...f, headerText: e.target.value }))}
                          placeholder="Texto do cabeçalho"
                          style={{ ...inputStyle, flex: 1 }}
                          maxLength={60}
                        />
                      )}
                      {form.headerType !== 'NONE' && form.headerType !== 'TEXT' && (
                        <span style={{ fontSize: 12, color: sub, alignSelf: 'center' }}>O arquivo será enviado ao usar o template no Chatwoot</span>
                      )}
                    </div>
                  </div>

                  {/* Corpo */}
                  <div>
                    <label style={{ fontSize: 12, color: labelColor, display: 'block', marginBottom: 4 }}>Corpo da Mensagem *</label>
                    <textarea
                      value={form.body}
                      onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                      placeholder="Olá, {{1}}! Seu pedido {{2}} está pronto para retirada."
                      required
                      rows={5}
                      maxLength={1024}
                      style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                    />
                    <p style={{ fontSize: 11, color: sub, marginTop: 4 }}>
                      Use {'{{1}}'}, {'{{2}}'}, {'{{3}}'} para variáveis dinâmicas. Máx. 1024 caracteres.
                      <span style={{ marginLeft: 6, color: form.body.length > 900 ? '#dc2626' : sub }}>{form.body.length}/1024</span>
                    </p>
                  </div>

                  {/* Rodapé */}
                  <div>
                    <label style={{ fontSize: 12, color: labelColor, display: 'block', marginBottom: 4 }}>Rodapé (opcional)</label>
                    <input
                      type="text"
                      value={form.footer}
                      onChange={(e) => setForm((f) => ({ ...f, footer: e.target.value }))}
                      placeholder="Ex: Não responda a esta mensagem"
                      style={inputStyle}
                      maxLength={60}
                    />
                  </div>

                  {/* Botões */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <label style={{ fontSize: 12, color: labelColor }}>Botões (máx. 3, opcional)</label>
                      {form.buttons.length < 3 && (
                        <button type="button" onClick={addButton} style={{ fontSize: 12, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                          + Adicionar botão
                        </button>
                      )}
                    </div>
                    {form.buttons.map((btn, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                        <select
                          value={btn.type}
                          onChange={(e) => updateButton(idx, 'type', e.target.value)}
                          style={{ ...inputStyle, width: 'auto', flexShrink: 0 }}
                        >
                          <option value="QUICK_REPLY">Resposta rápida</option>
                          <option value="URL">URL</option>
                          <option value="PHONE_NUMBER">Telefone</option>
                        </select>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <input
                            type="text"
                            value={btn.text}
                            onChange={(e) => updateButton(idx, 'text', e.target.value)}
                            placeholder="Texto do botão"
                            style={inputStyle}
                            maxLength={25}
                          />
                          {btn.type === 'URL' && (
                            <input
                              type="url"
                              value={btn.url || ''}
                              onChange={(e) => updateButton(idx, 'url', e.target.value)}
                              placeholder="https://exemplo.com"
                              style={inputStyle}
                            />
                          )}
                          {btn.type === 'PHONE_NUMBER' && (
                            <input
                              type="text"
                              value={btn.phone_number || ''}
                              onChange={(e) => updateButton(idx, 'phone_number', e.target.value)}
                              placeholder="+5511999999999"
                              style={inputStyle}
                            />
                          )}
                        </div>
                        <button type="button" onClick={() => removeButton(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 18, padding: '4px 0', flexShrink: 0 }}>×</button>
                      </div>
                    ))}
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      padding: '12px 24px', borderRadius: 10, border: 'none',
                      background: loading ? '#6b7280' : '#25d366', color: '#fff',
                      fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {loading ? 'Criando...' : 'Criar Template no WhatsApp'}
                  </button>
                </div>

                {/* Coluna direita — Preview */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={sectionTitle}>Preview</p>
                  {renderPreview()}
                  <div style={{ padding: 12, borderRadius: 8, background: dark ? '#1e3a2e' : '#f0fdf4', border: `1px solid ${dark ? '#166534' : '#bbf7d0'}` }}>
                    <p style={{ fontSize: 12, color: dark ? '#86efac' : '#166534', fontWeight: 600, marginBottom: 4 }}>Como funciona?</p>
                    <ul style={{ fontSize: 12, color: dark ? '#6ee7b7' : '#15803d', paddingLeft: 16, margin: 0, lineHeight: 1.8 }}>
                      <li>O template é enviado à Meta para aprovação</li>
                      <li>Aprovação leva de alguns minutos a horas</li>
                      <li>Após aprovado, fica disponível no Chatwoot</li>
                      <li>Variáveis {'{{1}}'} são preenchidas ao enviar</li>
                    </ul>
                  </div>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#6b7280' }}>
        Carregando...
      </div>
    }>
      <TemplatesPageContent />
    </Suspense>
  );
}
