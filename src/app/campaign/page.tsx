'use client'

import { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

function CampaignContent() {
  const searchParams = useSearchParams();
  const accountId = searchParams.get('accountId');
  const token = searchParams.get('token');
  const client = searchParams.get('client');
  const uid = searchParams.get('uid');
  const chatwootUrl = searchParams.get('chatwootUrl');
  const theme = searchParams.get('theme'); // 'dark' ou 'light'

  const [inboxes, setInboxes] = useState<any[]>([]);
  const [labels, setLabels] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingSubmit, setLoadingSubmit] = useState(false);

  // Toast State
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Apply theme class to document element on mount
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Form State
  const [name, setName] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const [postSendLabel, setPostSendLabel] = useState('');
  const [selectedInbox, setSelectedInbox] = useState('');
  const [minDelay, setMinDelay] = useState(3);
  const [maxDelay, setMaxDelay] = useState(15);

  // Flow State
  const [steps, setSteps] = useState<any[]>([
    { id: Date.now().toString(), type: 'text', content: '', delaySeconds: 10 }
  ]);

  // Upload State
  const [uploadingStepId, setUploadingStepId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = (stepId: string) => {
    setUploadingStepId(stepId);
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!uploadingStepId) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    Array.from(files).forEach((file) => {
      formData.append('files', file);
    });

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      
      if (data.success && data.urls) {
        setSteps(prevSteps => prevSteps.map(step => {
          if (step.id === uploadingStepId) {
            const newText = data.urls.join('\n');
            return {
              ...step,
              content: step.content ? `${step.content}\n${newText}` : newText
            };
          }
          return step;
        }));
        showToast('Upload realizado com sucesso!', 'success');
      } else {
        showToast(data.error || 'Falha no upload', 'error');
      }
    } catch (err) {
      showToast('Erro ao realizar upload das mídias', 'error');
    } finally {
      setUploadingStepId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (!accountId || !token || !chatwootUrl) return;

    const fetchInitialData = async () => {
      try {
        const queryParams = new URLSearchParams({
          accountId, token, chatwootUrl, 
          client: client || '', uid: uid || ''
        }).toString();

        const [inboxesRes, labelsRes, campaignsRes] = await Promise.all([
          fetch(`/api/chatwoot/inboxes?${queryParams}`),
          fetch(`/api/chatwoot/labels?${queryParams}`),
          fetch(`/api/campaigns?accountId=${accountId}&chatwootUrl=${encodeURIComponent(chatwootUrl)}`)
        ]);

        if (inboxesRes.ok) {
          const inbData = await inboxesRes.json();
          setInboxes(inbData.data || []);
        }
        if (labelsRes.ok) {
          const lblData = await labelsRes.json();
          setLabels(lblData.data || []);
        }
        if (campaignsRes.ok) {
          const campData = await campaignsRes.json();
          setCampaigns(campData.data || []);
        }
      } catch (err) {
        console.error('Error fetching data', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [accountId, token, client, uid, chatwootUrl]);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch(`/api/campaigns?accountId=${accountId}&chatwootUrl=${encodeURIComponent(chatwootUrl!)}`);
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !selectedLabel || !selectedInbox || steps.length === 0) {
      showToast("Preencha todos os campos obrigatórios", "error");
      return;
    }

    // Valida se todas as etapas possuem conteúdo
    if (steps.some(step => !step.content.trim())) {
      showToast("Todas as etapas do fluxo devem ter conteúdo ou URLs.", "error");
      return;
    }

    if (minDelay > maxDelay) {
      showToast("O Delay Mínimo geral não pode ser maior que o Máximo.", "error");
      return;
    }

    setLoadingSubmit(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          label: selectedLabel,
          postSendLabel: postSendLabel || null,
          inboxId: selectedInbox,
          steps: steps.map(({ type, content, delaySeconds }) => ({ type, content, delaySeconds: Number(delaySeconds) })),
          minDelay: Number(minDelay),
          maxDelay: Number(maxDelay),
          chatwootUrl,
          accountId,
          token,
          client: client || '',
          uid: uid || ''
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro desconhecido');

      showToast(`Campanha criada com sucesso! ${data.scheduledCount} mensagens agendadas.`, "success");
      setName('');
      setPostSendLabel('');
      setSteps([{ id: Date.now().toString(), type: 'text', content: '', delaySeconds: 10 }]);
      fetchCampaigns();
    } catch (err: any) {
      showToast(`Erro: ${err.message}`, "error");
    } finally {
      setLoadingSubmit(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error('Falha ao atualizar');
      fetchCampaigns();
    } catch (err: any) {
      showToast(`Erro: ${err.message}`, "error");
    }
  };

  if (!accountId || !token || !chatwootUrl) {
    return <div className="p-4 text-red-500 dark:text-red-400">Credenciais insuficientes na URL.</div>;
  }

  if (loading) return <div className="p-6 text-center text-gray-500 dark:text-gray-400">Carregando dados do Chatwoot...</div>;

  return (
    <div className="p-8 bg-slate-50 dark:bg-slate-900 min-h-screen text-slate-800 dark:text-slate-200">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Formulário */}
        <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 text-slate-900 dark:text-slate-100">
             Nova Campanha
          </h2>
          <form onSubmit={handleSubmit} className="space-y-6">
             <input 
               type="file" 
               multiple 
               className="hidden" 
               ref={fileInputRef} 
               onChange={handleFileUpload} 
             />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome da Ação</label>
                <input required type="text" className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" placeholder="Ex: Campanha Black Friday" value={name} onChange={e => setName(e.target.value)} />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Etiqueta Pós-Envio <span className="text-slate-500 font-normal">(Opcional)</span>
                </label>
                <select className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" value={postSendLabel} onChange={e => setPostSendLabel(e.target.value)}>
                  <option value="">Não adicionar etiqueta</option>
                  {labels.map(l => (
                    <option key={l.title} value={l.title}>{l.title}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Etiqueta (Público-alvo das conversas)</label>
                <select required className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" value={selectedLabel} onChange={e => setSelectedLabel(e.target.value)}>
                  <option value="">Selecione...</option>
                  {labels.map(l => (
                    <option key={l.title} value={l.title}>{l.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Caixa de Entrada</label>
                <select required className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" value={selectedInbox} onChange={e => setSelectedInbox(e.target.value)}>
                  <option value="">Selecione...</option>
                  {inboxes.map(i => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Delay Mínimo (Minutos) - Entre Contatos</label>
                <input required type="number" min="1" className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" value={minDelay} onChange={e => setMinDelay(Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Delay Máximo (Minutos) - Entre Contatos</label>
                <input required type="number" min="1" className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" value={maxDelay} onChange={e => setMaxDelay(Number(e.target.value))} />
              </div>
            </div>

            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mt-8 mb-4 border-b border-slate-200 dark:border-slate-700 pb-2">
               Fluxo de Mensagens
               <span className="block text-xs font-normal text-slate-500 mt-1">Configure as etapas que cada contato receberá sucessivamente.</span>
            </h3>

            <div className="space-y-4">
              {steps.map((step, index) => (
                <div key={step.id} className="p-5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800/50 relative">
                  <div className="flex justify-between items-center mb-4">
                    <span className="font-semibold text-sm bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-1 rounded">Etapa {index + 1}</span>
                    {steps.length > 1 && (
                      <button type="button" onClick={() => setSteps(steps.filter(s => s.id !== step.id))} className="text-red-500 hover:text-red-700 transition text-sm font-medium">
                         Remover
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo de Envio</label>
                      <select className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" 
                        value={step.type} 
                        onChange={e => {
                          const newSteps = [...steps];
                          newSteps[index].type = e.target.value;
                          setSteps(newSteps);
                        }}
                      >
                        <option value="text">Texto</option>
                        <option value="image">Imagem</option>
                        <option value="audio">Áudio</option>
                        <option value="video">Vídeo</option>
                        <option value="document">Documento</option>
                      </select>
                    </div>
                    
                    <div className="md:col-span-2">
                       <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Atraso antes desta etapa (Segundos)
                       </label>
                       <input type="number" min="10" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" 
                        value={step.delaySeconds} 
                        onChange={e => {
                          const newSteps = [...steps];
                          newSteps[index].delaySeconds = Number(e.target.value);
                          setSteps(newSteps);
                        }} 
                       />
                       <p className="text-xs text-slate-500 mt-1">Tempo de espera após o passo anterior (Mínimo recomendado de 10 segundos).</p>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                         {step.type === 'text' ? 'Mensagem de Texto' : 'URLs de Mídia'}
                      </label>
                      <button
                        type="button"
                        onClick={() => handleUploadClick(step.id)}
                        disabled={uploadingStepId === step.id}
                        className="text-xs font-medium px-2 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 rounded-md flex items-center gap-1 transition-colors"
                      >
                        {uploadingStepId === step.id ? '⏳ Enviando...' : '📎 Upload MinIO'}
                      </button>
                    </div>
                    <textarea required rows={4} className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono text-sm" 
                      placeholder={step.type === 'text' 
                        ? "Olá {João|Maria}, tudo {bem|joia}? Gostaria de falar sobre {nosso produto|nossa oferta}." 
                        : "https://minio.com/banner-a.jpg\nhttps://minio.com/banner-b.jpg\n(Insira uma URL por linha. O sistema irá sortear uma aleatoriamente por contato)"} 
                      value={step.content} 
                      onChange={e => {
                        const newSteps = [...steps];
                        newSteps[index].content = e.target.value;
                        setSteps(newSteps);
                      }}></textarea>
                      {step.type === 'text' && (
                        <p className="text-xs text-slate-500 mt-1">Suporta Spintax <code>{'{Opção A|Opção B}'}</code> para rotacionar variações.</p>
                      )}
                  </div>
                </div>
              ))}
            </div>

            <button type="button" onClick={() => setSteps([...steps, { id: Date.now().toString(), type: 'text', content: '', delaySeconds: 10 }])} className="w-full border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 py-3 rounded-lg font-medium transition flex justify-center items-center gap-2">
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
               Adicionar Etapa ao Fluxo
            </button>

            <button type="submit" disabled={loadingSubmit} className="w-full bg-[#1f93ff] hover:bg-blue-600 active:bg-blue-700 text-white font-medium py-3 rounded-lg transition disabled:opacity-75 disabled:cursor-wait mt-6 inline-flex justify-center items-center shadow-sm">
              {loadingSubmit ? (
                <span className="flex items-center gap-2">
                   <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                     <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                     <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                   </svg>
                   Agendando...
                </span>
              ) : 'Iniciar Disparo'}
            </button>
          </form>
        </div>

        {/* Lista de Campanhas */}
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
                <div key={camp.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-5 flex flex-col md:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 transition duration-150 shadow-sm">
                  <div className="flex-1 w-full">
                    <div className="flex items-center gap-3 mb-1">
                       <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-lg">{camp.name}</h3>
                       <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                         camp.status === 'COMPLETED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800' :
                         camp.status === 'RUNNING' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800' :
                         camp.status === 'PAUSED' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800' :
                         'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                       }`}>
                         {camp.status}
                       </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 mb-2 mt-3 overflow-hidden">
                       <div className="bg-[#1f93ff] h-2 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (camp.sentCount / (camp.totalContacts || 1)) * 100)}%` }}></div>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 font-medium flex gap-2 items-center">
                      Progresso: {camp.sentCount} / {camp.totalContacts} envios concluídos
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

        {/* Toast Notification */}
        {toast && (
          <div className={`fixed bottom-4 right-4 max-w-sm w-full p-4 rounded-xl shadow-lg border transform transition-all duration-300 z-50 flex items-start gap-3 ${
            toast.type === 'success' 
              ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/40 dark:border-green-800 dark:text-green-300' 
              : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/40 dark:border-red-800 dark:text-red-300'
          }`}>
             {toast.type === 'success' ? (
               <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
             ) : (
               <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
             )}
             <p className="font-medium text-sm flex-1">{toast.message}</p>
             <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100 transition focus:outline-none">
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
