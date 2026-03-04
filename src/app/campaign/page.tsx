'use client'

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function CampaignContent() {
  const searchParams = useSearchParams();
  const accountId = searchParams.get('accountId');
  const token = searchParams.get('token');
  const client = searchParams.get('client');
  const uid = searchParams.get('uid');
  const chatwootUrl = searchParams.get('chatwootUrl');

  const [inboxes, setInboxes] = useState<any[]>([]);
  const [labels, setLabels] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingSubmit, setLoadingSubmit] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const [selectedInbox, setSelectedInbox] = useState('');
  const [message, setMessage] = useState('');
  const [minDelay, setMinDelay] = useState(3);
  const [maxDelay, setMaxDelay] = useState(15);

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
    if (!name || !selectedLabel || !selectedInbox || !message) {
      alert("Preencha todos os campos obrigatórios");
      return;
    }

    if (minDelay > maxDelay) {
      alert("Delay mínimo não pode ser maior que o máximo");
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
          inboxId: selectedInbox,
          message,
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

      alert(`Campanha criada com sucesso! ${data.scheduledCount} mensagens agendadas.`);
      setName('');
      setMessage('');
      fetchCampaigns();
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
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
      alert(`Erro: ${err.message}`);
    }
  };

  if (!accountId || !token || !chatwootUrl) {
    return <div className="p-4 text-red-500">Credenciais insuficientes na URL.</div>;
  }

  if (loading) return <div className="p-6 text-center text-gray-500">Carregando dados do Chatwoot...</div>;

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Formulário */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 text-gray-800">
             Nova Campanha
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Ação</label>
              <input required type="text" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: Campanha Black Friday" value={name} onChange={e => setName(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Etiqueta (Público-alvo)</label>
                <select required className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none" value={selectedLabel} onChange={e => setSelectedLabel(e.target.value)}>
                  <option value="">Selecione...</option>
                  {labels.map(l => (
                    <option key={l.title} value={l.title}>{l.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Caixa de Entrada</label>
                <select required className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none" value={selectedInbox} onChange={e => setSelectedInbox(e.target.value)}>
                  <option value="">Selecione...</option>
                  {inboxes.map(i => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Delay Mínimo (Minutos)</label>
                <input required type="number" min="1" className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none" value={minDelay} onChange={e => setMinDelay(Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Delay Máximo (Minutos)</label>
                <input required type="number" min="1" className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none" value={maxDelay} onChange={e => setMaxDelay(Number(e.target.value))} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem</label>
              <textarea required rows={4} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Olá {{nome}}, temos uma novidade..." value={message} onChange={e => setMessage(e.target.value)}></textarea>
            </div>

            <button type="submit" disabled={loadingSubmit} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition">
              {loadingSubmit ? 'Agendando...' : 'Iniciar Disparo'}
            </button>
          </form>
        </div>

        {/* Lista de Campanhas */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Campanhas Ativas</h2>
          {campaigns.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhuma campanha criada.</p>
          ) : (
            <div className="space-y-4">
              {campaigns.map(camp => (
                <div key={camp.id} className="border border-gray-200 rounded-lg p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                  <div>
                    <h3 className="font-semibold text-gray-800">{camp.name}</h3>
                    <p className="text-sm text-gray-500">
                      Progresso: {camp.sentCount} / {camp.totalContacts} envios
                      <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100">{camp.status}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Criada em: {new Date(camp.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2">
                    {camp.status === 'RUNNING' && (
                      <button onClick={() => handleStatusChange(camp.id, 'PAUSED')} className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 text-sm font-medium transition">Pausar</button>
                    )}
                    {camp.status === 'PAUSED' && (
                      <button onClick={() => handleStatusChange(camp.id, 'RUNNING')} className="px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 text-sm font-medium transition">Retomar</button>
                    )}
                    {(camp.status === 'RUNNING' || camp.status === 'PAUSED') && (
                      <button onClick={() => handleStatusChange(camp.id, 'CANCELLED')} className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm font-medium transition">Cancelar</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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
