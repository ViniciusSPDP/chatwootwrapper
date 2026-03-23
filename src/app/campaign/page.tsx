'use client'

import { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

type CampaignMode = 'chatwoot' | 'whatsapp_api';
type VarSource = 'name' | 'phone' | 'attr' | 'static';

function CampaignContent() {
  const searchParams = useSearchParams();
  const accountId = searchParams.get('accountId');
  const token = searchParams.get('token');
  const client = searchParams.get('client');
  const uid = searchParams.get('uid');
  const chatwootUrl = searchParams.get('chatwootUrl');
  const theme = searchParams.get('theme');

  const [inboxes, setInboxes] = useState<any[]>([]);
  const [labels, setLabels] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [customAttributes, setCustomAttributes] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingSubmit, setLoadingSubmit] = useState(false);

  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Tab
  const [campaignMode, setCampaignMode] = useState<CampaignMode>('chatwoot');

  // ── Chatwoot form state ──
  const [name, setName] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const [postSendLabel, setPostSendLabel] = useState('');
  const [selectedInbox, setSelectedInbox] = useState('');
  const [minDelay, setMinDelay] = useState(3);
  const [maxDelay, setMaxDelay] = useState(15);
  const [steps, setSteps] = useState<any[]>([
    { id: Date.now().toString(), type: 'text', content: '', delaySeconds: 10 }
  ]);

  // Attr insert
  const [attrDropdownStep, setAttrDropdownStep] = useState<string | null>(null);
  const stepRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // Upload State
  const [uploadingStepId, setUploadingStepId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── WhatsApp API form state ──
  const [waName, setWaName] = useState('');
  const [waLabel, setWaLabel] = useState('');
  const [waPostSendLabel, setWaPostSendLabel] = useState('');
  const [waMinDelay, setWaMinDelay] = useState(5);
  const [waMaxDelay, setWaMaxDelay] = useState(30);
  const [waInboxId, setWaInboxId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [waAccessToken, setWaAccessToken] = useState('');
  const [waTemplates, setWaTemplates] = useState<any[]>([]);
  const [loadingWaTemplates, setLoadingWaTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [templateVarMap, setTemplateVarMap] = useState<Array<{position: number; source: VarSource; value: string}>>([]);

  const whatsappInboxes = inboxes.filter(i => i.channel_type === 'Channel::Whatsapp');

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [theme]);

  useEffect(() => {
    if (!accountId || !token || !chatwootUrl) return;
    const fetchInitialData = async () => {
      try {
        const queryParams = new URLSearchParams({
          accountId, token, chatwootUrl,
          client: client || '', uid: uid || ''
        }).toString();

        const [inboxesRes, labelsRes, campaignsRes, attrsRes] = await Promise.all([
          fetch(`/api/chatwoot/inboxes?${queryParams}`),
          fetch(`/api/chatwoot/labels?${queryParams}`),
          fetch(`/api/campaigns?accountId=${accountId}&chatwootUrl=${encodeURIComponent(chatwootUrl)}`),
          fetch(`/api/chatwoot/custom-attributes?${queryParams}`)
        ]);

        if (inboxesRes.ok) { const d = await inboxesRes.json(); setInboxes(d.data || []); }
        if (labelsRes.ok)  { const d = await labelsRes.json();  setLabels(d.data || []); }
        if (campaignsRes.ok) { const d = await campaignsRes.json(); setCampaigns(d.data || []); }
        if (attrsRes.ok)  { const d = await attrsRes.json();   setCustomAttributes(d.data || []); }
      } catch (err) {
        console.error('Error fetching data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, [accountId, token, client, uid, chatwootUrl]);

  // When WA inbox selected, auto-fill credentials
  useEffect(() => {
    if (!waInboxId) return;
    const inbox = whatsappInboxes.find(i => String(i.id) === waInboxId);
    if (!inbox) return;
    const cfg = inbox.provider_config || {};
    if (cfg.business_account_id) setWabaId(cfg.business_account_id);
    if (cfg.phone_number_id) setPhoneNumberId(cfg.phone_number_id);
    if (cfg.api_key) setWaAccessToken(cfg.api_key);
  }, [waInboxId]);

  // Fetch WA templates when credentials are ready
  useEffect(() => {
    if (!wabaId || !waAccessToken) return;
    setLoadingWaTemplates(true);
    fetch(`/api/whatsapp/templates?waba_id=${encodeURIComponent(wabaId)}&access_token=${encodeURIComponent(waAccessToken)}`)
      .then(r => r.json())
      .then(d => {
        const approved = (d.data || []).filter((t: any) => t.status === 'APPROVED');
        setWaTemplates(approved);
      })
      .catch(() => {})
      .finally(() => setLoadingWaTemplates(false));
  }, [wabaId, waAccessToken]);

  // When template selected, extract {{N}} variables from body
  const handleTemplateSelect = (templateName: string) => {
    const tpl = waTemplates.find(t => t.name === templateName);
    setSelectedTemplate(tpl || null);
    if (!tpl) { setTemplateVarMap([]); return; }

    const bodyComp = (tpl.components || []).find((c: any) => c.type === 'BODY');
    const bodyText = bodyComp?.text || '';
    const matches = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)];
    const positions = [...new Set(matches.map((m: any) => Number(m[1])))].sort((a, b) => a - b);
    setTemplateVarMap(positions.map(pos => ({ position: pos, source: 'name' as VarSource, value: '' })));
  };

  const updateVarMap = (position: number, field: 'source' | 'value', val: string) => {
    setTemplateVarMap(prev => prev.map(v =>
      v.position === position ? { ...v, [field]: val } : v
    ));
  };

  // Upload for Chatwoot campaign steps
  const handleUploadClick = (stepId: string) => {
    setUploadingStepId(stepId);
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!uploadingStepId) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const formData = new FormData();
    Array.from(files).forEach(f => formData.append('files', f));
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success && data.urls) {
        setSteps(prev => prev.map(step => {
          if (step.id !== uploadingStepId) return step;
          const newText = data.urls.join('\n');
          return { ...step, content: step.content ? `${step.content}\n${newText}` : newText };
        }));
        showToast('Upload realizado!', 'success');
      } else {
        showToast(data.error || 'Falha no upload', 'error');
      }
    } catch {
      showToast('Erro ao realizar upload', 'error');
    } finally {
      setUploadingStepId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const insertAttr = (stepId: string, attrKey: string) => {
    const textarea = stepRefs.current[stepId];
    const tag = `{{${attrKey}}}`;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      setSteps(prev => prev.map(step => {
        if (step.id !== stepId) return step;
        const c = step.content;
        return { ...step, content: c.slice(0, start) + tag + c.slice(end) };
      }));
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + tag.length, start + tag.length);
      }, 0);
    } else {
      setSteps(prev => prev.map(step =>
        step.id === stepId ? { ...step, content: step.content + tag } : step
      ));
    }
    setAttrDropdownStep(null);
  };

  const fetchCampaigns = async () => {
    try {
      const res = await fetch(`/api/campaigns?accountId=${accountId}&chatwootUrl=${encodeURIComponent(chatwootUrl!)}`);
      if (res.ok) { const d = await res.json(); setCampaigns(d.data || []); }
    } catch {}
  };

  const handleChatwootSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !selectedLabel || !selectedInbox || steps.length === 0) {
      showToast('Preencha todos os campos obrigatórios', 'error'); return;
    }
    if (steps.some(s => !s.content.trim())) {
      showToast('Todas as etapas devem ter conteúdo ou URLs.', 'error'); return;
    }
    if (minDelay > maxDelay) {
      showToast('Delay Mínimo não pode ser maior que o Máximo.', 'error'); return;
    }
    setLoadingSubmit(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, label: selectedLabel, postSendLabel: postSendLabel || null,
          inboxId: selectedInbox,
          steps: steps.map(({ type, content, delaySeconds }) => ({ type, content, delaySeconds: Number(delaySeconds) })),
          minDelay: Number(minDelay), maxDelay: Number(maxDelay),
          chatwootUrl, accountId, token, client: client || '', uid: uid || ''
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
      showToast(`Campanha criada! ${data.scheduledCount} mensagens agendadas.`, 'success');
      setName(''); setPostSendLabel('');
      setSteps([{ id: Date.now().toString(), type: 'text', content: '', delaySeconds: 10 }]);
      fetchCampaigns();
    } catch (err: any) {
      showToast(`Erro: ${err.message}`, 'error');
    } finally {
      setLoadingSubmit(false);
    }
  };

  const handleWaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waName || !waLabel || !waInboxId || !selectedTemplate) {
      showToast('Preencha todos os campos obrigatórios', 'error'); return;
    }
    if (waMinDelay > waMaxDelay) {
      showToast('Delay Mínimo não pode ser maior que o Máximo.', 'error'); return;
    }
    setLoadingSubmit(true);
    try {
      const res = await fetch('/api/whatsapp/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: waName, label: waLabel, postSendLabel: waPostSendLabel || null,
          wabaId, phoneNumberId, accessToken: waAccessToken,
          templateName: selectedTemplate.name, templateLanguage: selectedTemplate.language,
          templateVarMap,
          minDelaySeconds: Number(waMinDelay), maxDelaySeconds: Number(waMaxDelay),
          chatwootUrl, accountId, token, client: client || '', uid: uid || ''
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
      showToast(`Campanha WA criada! ${data.scheduledCount} mensagens agendadas.`, 'success');
      setWaName(''); setWaLabel(''); setWaPostSendLabel(''); setSelectedTemplate(null); setTemplateVarMap([]);
      fetchCampaigns();
    } catch (err: any) {
      showToast(`Erro: ${err.message}`, 'error');
    } finally {
      setLoadingSubmit(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error('Falha ao atualizar');
      fetchCampaigns();
    } catch (err: any) {
      showToast(`Erro: ${err.message}`, 'error');
    }
  };

  if (!accountId || !token || !chatwootUrl) {
    return <div className="p-4 text-red-500">Credenciais insuficientes na URL.</div>;
  }
  if (loading) return <div className="p-6 text-center text-gray-500">Carregando dados do Chatwoot...</div>;

  const inputCls = 'w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100';
  const labelCls = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1';

  return (
    <div className="p-8 bg-slate-50 dark:bg-slate-900 min-h-screen text-slate-800 dark:text-slate-200">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Tab toggle */}
        <div className="flex gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setCampaignMode('chatwoot')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              campaignMode === 'chatwoot'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            Via Chatwoot
          </button>
          {whatsappInboxes.length > 0 && (
            <button
              type="button"
              onClick={() => setCampaignMode('whatsapp_api')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
                campaignMode === 'whatsapp_api'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
              Via API WhatsApp
            </button>
          )}
        </div>

        {/* ── CHATWOOT FORM ── */}
        {campaignMode === 'chatwoot' && (
          <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
            <h2 className="text-xl font-semibold mb-6 text-slate-900 dark:text-slate-100">Nova Campanha — Via Chatwoot</h2>
            <form onSubmit={handleChatwootSubmit} className="space-y-6">
              <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileUpload} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={labelCls}>Nome da Ação</label>
                  <input required type="text" className={inputCls} placeholder="Ex: Black Friday" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Etiqueta Pós-Envio <span className="text-slate-500 font-normal">(Opcional)</span></label>
                  <select className={inputCls} value={postSendLabel} onChange={e => setPostSendLabel(e.target.value)}>
                    <option value="">Não adicionar etiqueta</option>
                    {labels.map(l => <option key={l.title} value={l.title}>{l.title}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className={labelCls}>Etiqueta (Público-alvo)</label>
                  <select required className={inputCls} value={selectedLabel} onChange={e => setSelectedLabel(e.target.value)}>
                    <option value="">Selecione...</option>
                    {labels.map(l => <option key={l.title} value={l.title}>{l.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Caixa de Entrada</label>
                  <select required className={inputCls} value={selectedInbox} onChange={e => setSelectedInbox(e.target.value)}>
                    <option value="">Selecione...</option>
                    {inboxes.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className={labelCls}>Delay Mínimo (min) — Entre Contatos</label>
                  <input required type="number" min="1" className={inputCls} value={minDelay} onChange={e => setMinDelay(Number(e.target.value))} />
                </div>
                <div>
                  <label className={labelCls}>Delay Máximo (min) — Entre Contatos</label>
                  <input required type="number" min="1" className={inputCls} value={maxDelay} onChange={e => setMaxDelay(Number(e.target.value))} />
                </div>
              </div>

              <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2">
                Fluxo de Mensagens
                <span className="block text-xs font-normal text-slate-500 mt-1">
                  Texto: suporta <code>{'{A|B}'}</code> (Spintax) e <code>{'{{attr_key}}'}</code> (Atributos da conversa).<br />
                  Mídia: uma URL por linha — sistema sorteia uma por contato.
                </span>
              </h3>

              <div className="space-y-4">
                {steps.map((step, index) => (
                  <div key={step.id} className="p-5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex justify-between items-center mb-4">
                      <span className="font-semibold text-sm bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-1 rounded">Etapa {index + 1}</span>
                      {steps.length > 1 && (
                        <button type="button" onClick={() => setSteps(steps.filter(s => s.id !== step.id))} className="text-red-500 hover:text-red-700 text-sm font-medium">Remover</button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className={labelCls}>Tipo</label>
                        <select className={inputCls} value={step.type} onChange={e => { const ns = [...steps]; ns[index].type = e.target.value; setSteps(ns); }}>
                          <option value="text">Texto</option>
                          <option value="image">Imagem</option>
                          <option value="audio">Áudio</option>
                          <option value="video">Vídeo</option>
                          <option value="document">Documento</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className={labelCls}>Atraso antes desta etapa (segundos)</label>
                        <input type="number" min="10" className={inputCls} value={step.delaySeconds} onChange={e => { const ns = [...steps]; ns[index].delaySeconds = Number(e.target.value); setSteps(ns); }} />
                        <p className="text-xs text-slate-500 mt-1">Mínimo recomendado: 10s</p>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1 gap-2">
                        <label className={labelCls + ' mb-0'}>
                          {step.type === 'text' ? 'Mensagem de Texto' : 'URLs de Mídia'}
                        </label>
                        <div className="flex items-center gap-2">
                          {/* Insert attribute button (text only) */}
                          {step.type === 'text' && customAttributes.length > 0 && (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setAttrDropdownStep(attrDropdownStep === step.id ? null : step.id)}
                                className="text-xs font-medium px-2 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50 rounded-md flex items-center gap-1 transition-colors"
                              >
                                {'{{ Atributo'}
                              </button>
                              {attrDropdownStep === step.id && (
                                <div className="absolute right-0 top-8 z-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg min-w-[180px] py-1">
                                  {customAttributes.map((attr: any) => (
                                    <button
                                      key={attr.attribute_key || attr.key}
                                      type="button"
                                      onClick={() => insertAttr(step.id, attr.attribute_key || attr.key)}
                                      className="w-full text-left px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                                    >
                                      {attr.attribute_display_name || attr.name || attr.attribute_key || attr.key}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => handleUploadClick(step.id)}
                            disabled={uploadingStepId === step.id}
                            className="text-xs font-medium px-2 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 rounded-md flex items-center gap-1 transition-colors"
                          >
                            {uploadingStepId === step.id ? '⏳ Enviando...' : '📎 Upload MinIO'}
                          </button>
                        </div>
                      </div>
                      <textarea
                        required
                        rows={4}
                        ref={el => { stepRefs.current[step.id] = el; }}
                        className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono text-sm"
                        placeholder={step.type === 'text'
                          ? 'Olá {João|Maria}! Seu {{plano}} foi renovado.'
                          : 'https://minio.com/banner-a.jpg\nhttps://minio.com/banner-b.jpg\n(Uma URL por linha — sorteia uma por contato)'}
                        value={step.content}
                        onChange={e => { const ns = [...steps]; ns[index].content = e.target.value; setSteps(ns); }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button type="button" onClick={() => setSteps([...steps, { id: Date.now().toString(), type: 'text', content: '', delaySeconds: 10 }])} className="w-full border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-slate-400 py-3 rounded-lg font-medium transition flex justify-center items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                Adicionar Etapa ao Fluxo
              </button>

              <button type="submit" disabled={loadingSubmit} className="w-full bg-[#1f93ff] hover:bg-blue-600 text-white font-medium py-3 rounded-lg transition disabled:opacity-75 mt-6 inline-flex justify-center items-center shadow-sm">
                {loadingSubmit ? <span className="flex items-center gap-2"><svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Agendando...</span> : 'Iniciar Disparo'}
              </button>
            </form>
          </div>
        )}

        {/* ── WHATSAPP API FORM ── */}
        {campaignMode === 'whatsapp_api' && (
          <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
            <h2 className="text-xl font-semibold mb-2 text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Nova Campanha — Via API WhatsApp
              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">API Oficial</span>
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Envia templates aprovados pela Meta diretamente via API, sem passar pelo Chatwoot. Delay em segundos.</p>

            <form onSubmit={handleWaSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={labelCls}>Nome da Campanha</label>
                  <input required type="text" className={inputCls} placeholder="Ex: Promo Março" value={waName} onChange={e => setWaName(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Etiqueta Pós-Envio <span className="text-slate-500 font-normal">(Opcional)</span></label>
                  <select className={inputCls} value={waPostSendLabel} onChange={e => setWaPostSendLabel(e.target.value)}>
                    <option value="">Não adicionar etiqueta</option>
                    {labels.map(l => <option key={l.title} value={l.title}>{l.title}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className={labelCls}>Etiqueta (Público-alvo)</label>
                  <select required className={inputCls} value={waLabel} onChange={e => setWaLabel(e.target.value)}>
                    <option value="">Selecione...</option>
                    {labels.map(l => <option key={l.title} value={l.title}>{l.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Inbox WhatsApp</label>
                  <select required className={inputCls} value={waInboxId} onChange={e => setWaInboxId(e.target.value)}>
                    <option value="">Selecione...</option>
                    {whatsappInboxes.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Credentials (auto-filled, readonly) */}
              {waInboxId && (
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 space-y-3">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Credenciais Meta (preenchidas automaticamente)</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">WABA ID</label>
                      <input className={inputCls + ' text-xs'} value={wabaId} onChange={e => setWabaId(e.target.value)} placeholder="Auto" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">Phone Number ID</label>
                      <input className={inputCls + ' text-xs'} value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)} placeholder="Auto" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">Access Token</label>
                      <input type="password" className={inputCls + ' text-xs'} value={waAccessToken} onChange={e => setWaAccessToken(e.target.value)} placeholder="Auto" />
                    </div>
                  </div>
                </div>
              )}

              {/* Template selector */}
              <div>
                <label className={labelCls}>Template Aprovado</label>
                {loadingWaTemplates ? (
                  <p className="text-sm text-slate-400">Carregando templates...</p>
                ) : waTemplates.length === 0 && wabaId ? (
                  <p className="text-sm text-slate-400">Nenhum template APPROVED encontrado.</p>
                ) : (
                  <select required className={inputCls} value={selectedTemplate?.name || ''} onChange={e => handleTemplateSelect(e.target.value)}>
                    <option value="">Selecione um template...</option>
                    {waTemplates.map(t => (
                      <option key={t.name} value={t.name}>{t.name} ({t.language})</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Template preview + variable mapping */}
              {selectedTemplate && (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Preview do Template</p>
                    {(selectedTemplate.components || []).map((comp: any, i: number) => (
                      <p key={i} className="text-sm text-slate-700 dark:text-slate-300">
                        <span className="text-xs text-slate-400 mr-1">[{comp.type}]</span>
                        {comp.text || (comp.format ? `[${comp.format}]` : '')}
                      </p>
                    ))}
                  </div>

                  {templateVarMap.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Mapeamento de Variáveis</p>
                      <div className="space-y-3">
                        {templateVarMap.map(varDef => (
                          <div key={varDef.position} className="flex items-center gap-3">
                            <span className="text-sm font-mono bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded text-slate-700 dark:text-slate-300 shrink-0">
                              {`{{${varDef.position}}}`}
                            </span>
                            <select
                              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                              value={varDef.source}
                              onChange={e => updateVarMap(varDef.position, 'source', e.target.value)}
                            >
                              <option value="name">Nome do Contato</option>
                              <option value="phone">Telefone</option>
                              {customAttributes.length > 0 && <option value="attr">Atributo da Conversa</option>}
                              <option value="static">Texto Fixo</option>
                            </select>
                            {varDef.source === 'attr' && (
                              <select
                                className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                                value={varDef.value}
                                onChange={e => updateVarMap(varDef.position, 'value', e.target.value)}
                              >
                                <option value="">Selecione atributo...</option>
                                {customAttributes.map((attr: any) => (
                                  <option key={attr.attribute_key || attr.key} value={attr.attribute_key || attr.key}>
                                    {attr.attribute_display_name || attr.name || attr.attribute_key}
                                  </option>
                                ))}
                              </select>
                            )}
                            {varDef.source === 'static' && (
                              <input
                                type="text"
                                className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                                placeholder="Valor fixo para todos os contatos"
                                value={varDef.value}
                                onChange={e => updateVarMap(varDef.position, 'value', e.target.value)}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className={labelCls}>Delay Mínimo (seg) — Entre Contatos</label>
                  <input required type="number" min="1" className={inputCls} value={waMinDelay} onChange={e => setWaMinDelay(Number(e.target.value))} />
                </div>
                <div>
                  <label className={labelCls}>Delay Máximo (seg) — Entre Contatos</label>
                  <input required type="number" min="1" className={inputCls} value={waMaxDelay} onChange={e => setWaMaxDelay(Number(e.target.value))} />
                </div>
              </div>

              <button type="submit" disabled={loadingSubmit} className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 rounded-lg transition disabled:opacity-75 mt-6 inline-flex justify-center items-center shadow-sm">
                {loadingSubmit ? <span className="flex items-center gap-2"><svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Agendando...</span> : 'Iniciar Disparo via API WhatsApp'}
              </button>
            </form>
          </div>
        )}

        {/* ── CAMPAIGN LIST ── */}
        <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-semibold mb-6 text-slate-900 dark:text-slate-100 flex items-center justify-between">
            Campanhas Ativas
            <button onClick={fetchCampaigns} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition" title="Recarregar">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg>
            </button>
          </h2>
          {campaigns.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400 text-sm text-center py-6">Nenhuma campanha criada ainda.</p>
          ) : (
            <div className="space-y-4">
              {campaigns.map(camp => (
                <div key={camp.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-5 flex flex-col md:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 transition shadow-sm">
                  <div className="flex-1 w-full">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-lg">{camp.name}</h3>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        camp.status === 'COMPLETED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800' :
                        camp.status === 'RUNNING' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800' :
                        camp.status === 'PAUSED' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800' :
                        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                      }`}>{camp.status}</span>
                      {camp.type === 'WHATSAPP_API' && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-800 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>API WA
                        </span>
                      )}
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 mb-2 mt-3 overflow-hidden">
                      <div className="bg-[#1f93ff] h-2 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (camp.sentCount / (camp.totalContacts || 1)) * 100)}%` }}></div>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">
                      Enviado: {camp.sentCount} / {camp.totalContacts}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Criada em: {new Date(camp.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2">
                    {camp.status === 'RUNNING' && (
                      <button onClick={() => handleStatusChange(camp.id, 'PAUSED')} className="px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-500 border border-yellow-200 dark:border-yellow-800/50 hover:bg-yellow-100 dark:hover:bg-yellow-900/40 rounded-lg text-sm font-medium transition cursor-pointer">Pausar</button>
                    )}
                    {camp.status === 'PAUSED' && (
                      <button onClick={() => handleStatusChange(camp.id, 'RUNNING')} className="px-4 py-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-500 border border-green-200 dark:border-green-800/50 hover:bg-green-100 dark:hover:bg-green-900/40 rounded-lg text-sm font-medium transition cursor-pointer">Retomar</button>
                    )}
                    {(camp.status === 'RUNNING' || camp.status === 'PAUSED') && (
                      <button onClick={() => handleStatusChange(camp.id, 'CANCELLED')} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-sm font-medium transition cursor-pointer">Cancelar</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div className={`fixed bottom-4 right-4 max-w-sm w-full p-4 rounded-xl shadow-lg border z-50 flex items-start gap-3 ${
            toast.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/40 dark:border-green-800 dark:text-green-300'
              : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/40 dark:border-red-800 dark:text-red-300'
          }`}>
            {toast.type === 'success'
              ? <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
              : <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            }
            <p className="font-medium text-sm flex-1">{toast.message}</p>
            <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100 transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CampaignPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-gray-500">Carregando...</div>}>
      <CampaignContent />
    </Suspense>
  );
}
