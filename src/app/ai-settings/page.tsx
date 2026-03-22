'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function AiSettingsContent() {
  const searchParams = useSearchParams();
  const accountId = searchParams.get('accountId');
  const token = searchParams.get('token');
  const chatwootUrl = searchParams.get('chatwootUrl');
  const theme = searchParams.get('theme') || 'light';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agent, setAgent] = useState<any>(null);
  const [inboxes, setInboxes] = useState<any[]>([]);
  const [financial, setFinancial] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Tab state: 0 = Configuração, 1 = Financeiro
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (accountId && token && chatwootUrl) {
      fetchSettings();
    }
  }, [accountId, token, chatwootUrl]);

  const fetchSettings = async () => {
    try {
      const res = await fetch(`/api/ai-settings?accountId=${accountId}&token=${token}&chatwootUrl=${encodeURIComponent(chatwootUrl!)}`);
      const data = await res.json();
      if (res.ok) {
        setAgent(data.agent);
        setInboxes(data.inboxes || []);
        setFinancial(data.financial);
        setErrorMsg(null);
      } else {
        setErrorMsg(data.error || 'Erro ao carregar dados do tenant.');
      }
    } catch (error) {
      console.error('Error fetching settings', error);
      setErrorMsg('Erro de conexão ao buscar dados.');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/ai-settings?accountId=${accountId}&token=${token}&chatwootUrl=${encodeURIComponent(chatwootUrl!)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(agent)
      });
      
      if (res.ok) {
        alert('Configurações salvas com sucesso!');
      } else {
        alert('Erro ao salvar as configurações.');
      }
    } catch (error) {
      alert('Erro ao salvar as configurações.');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (!accountId || !token || !chatwootUrl) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white">
        Acesso inválido. Faltam parâmetros.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white">
        <div className="flex flex-col items-center">
          <svg className="animate-spin h-8 w-8 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Carregando agente de IA...
        </div>
      </div>
    );
  }

  const isDark = theme === 'dark';
  
  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'} p-6 font-sans`}>
      <div className="max-w-4xl mx-auto">
        
        {/* Error Message */}
        {errorMsg && (
          <div className="p-4 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 rounded-lg mb-6 text-center border border-red-200 dark:border-red-800/50">
             <p className="font-bold text-lg mb-1">Erro de Integração</p>
             <p className="text-sm mb-2">{errorMsg}</p>
             <p className="text-xs opacity-80">Verifique se o seu Tenant está cadastrado corretamente no banco de dados.</p>
             <p className="text-xs opacity-80 mt-1">Conta: <strong>{accountId}</strong> | URL: <strong>{chatwootUrl}</strong></p>
          </div>
        )}

        {/* Header Tabs */}
        {!errorMsg && (
          <div className="flex mb-6 border-b border-slate-200 dark:border-slate-700">
            <button 
              onClick={() => setActiveTab(0)}
              className={`py-3 px-6 font-medium text-sm transition-colors border-b-2 ${activeTab === 0 ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              Configuração do Agente
            </button>
            <button 
              onClick={() => setActiveTab(1)}
              className={`py-3 px-6 font-medium text-sm transition-colors border-b-2 ${activeTab === 1 ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              Painel Financeiro (Tokens)
            </button>
          </div>
        )}

        {/* TAB 0: CONFIGURAÇÕES */}
        {activeTab === 0 && agent && !errorMsg && (
          <div className={`rounded-xl shadow-sm border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} p-6`}>
            
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h2 className="text-xl font-bold">Status do Agente</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">O agente responderá automaticamente as mensagens dos contatos.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={agent.isActive}
                  onChange={(e) => setAgent({...agent, isActive: e.target.checked})}
                />
                <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
                <span className="ml-3 text-sm font-medium">{agent.isActive ? 'Ativo' : 'Desligado'}</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium mb-1">Modelo de IA</label>
                <select 
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${isDark ? 'bg-slate-900 border-slate-600' : 'bg-white border-slate-300'}`}
                  value={agent.modelName}
                  onChange={(e) => setAgent({...agent, modelName: e.target.value})}
                >
                  <option value="gpt-4o-mini">GPT-4o Mini (Mais barato e rápido)</option>
                  <option value="gpt-4o">GPT-4o (Mais inteligente)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Temperatura (Criatividade)</label>
                <input 
                  type="number" step="0.1" min="0" max="1"
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${isDark ? 'bg-slate-900 border-slate-600' : 'bg-white border-slate-300'}`}
                  value={agent.temperature}
                  onChange={(e) => setAgent({...agent, temperature: parseFloat(e.target.value)})}
                />
                <p className="text-xs text-slate-500 mt-1">0.2 é recomendado para assistentes comerciais.</p>
              </div>
            </div>

            {inboxes && inboxes.length > 0 && (
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Caixas de Entrada Permitidas (Inboxes)</label>
                <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 p-4 border rounded-lg ${isDark ? 'bg-slate-900 border-slate-600' : 'bg-white border-slate-300'}`}>
                  {inboxes.map((inbox: any) => (
                    <label key={inbox.id} className="flex items-center space-x-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 outline-none"
                        checked={agent.inboxIds?.includes(inbox.id) || false}
                        onChange={(e) => {
                          const currentIds = agent.inboxIds || [];
                          if (e.target.checked) {
                            setAgent({...agent, inboxIds: [...currentIds, inbox.id]});
                          } else {
                            setAgent({...agent, inboxIds: currentIds.filter((id: number) => id !== inbox.id)});
                          }
                        }}
                      />
                      <span className="text-sm font-medium">{inbox.name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-1">Se nenhuma for marcada, a IA responderá em todas as caixas. Marque para limitar a Inteligência Artificial a caixas específicas (ex: "Canal de Vendas Varejo").</p>
              </div>
            )}

            <div className="mb-6">
               <label className="block text-sm font-medium mb-1">Chave da OpenAI (API Key)</label>
               <input 
                  type="password"
                  placeholder="sk-..."
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${isDark ? 'bg-slate-900 border-slate-600' : 'bg-white border-slate-300'}`}
                  value={agent.openAiKey || ''}
                  onChange={(e) => setAgent({...agent, openAiKey: e.target.value})}
                />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                  <label className="block text-sm font-medium mb-1">ElevenLabs API Key (Para Áudio)</label>
                  <input 
                    type="password"
                    placeholder="Deixe em branco se não quiser responder em áudio"
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${isDark ? 'bg-slate-900 border-slate-600' : 'bg-white border-slate-300'}`}
                    value={agent.elevenLabsApiKey || ''}
                    onChange={(e) => setAgent({...agent, elevenLabsApiKey: e.target.value})}
                  />
              </div>
              <div>
                  <label className="block text-sm font-medium mb-1">ElevenLabs Voice ID</label>
                  <input 
                    type="text"
                    placeholder="ID da voz clonada (Ex: kN2...)"
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${isDark ? 'bg-slate-900 border-slate-600' : 'bg-white border-slate-300'}`}
                    value={agent.elevenLabsVoiceId || ''}
                    onChange={(e) => setAgent({...agent, elevenLabsVoiceId: e.target.value})}
                  />
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium mb-1">Prompt da Persona (Instruções do Agente)</label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Descreva exatamente como a IA deve agir e o roteiro dela. Não precisa ensinar nome de tool, nós resolvemos por baixo dos panos.</p>
              <textarea 
                className={`w-full px-4 py-3 border rounded-lg h-96 font-mono text-sm leading-relaxed focus:ring-2 focus:ring-blue-500 outline-none ${isDark ? 'bg-slate-900 border-slate-600' : 'bg-white border-slate-300'}`}
                placeholder="Ex: Você é a Lola, assistente oficial da Lola Shop..."
                value={agent.prompt || ''}
                onChange={(e) => setAgent({...agent, prompt: e.target.value})}
              ></textarea>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-700">
              <button 
                onClick={saveSettings}
                disabled={saving}
                className={`px-6 py-2.5 rounded-lg font-medium text-white transition-colors ${
                  saving ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {saving ? 'Saltando...' : 'Salvar Configurações'}
              </button>
            </div>

          </div>
        )}

        {/* TAB 1: FINANCEIRO */}
        {activeTab === 1 && financial && (
           <div className={`rounded-xl shadow-sm border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} p-6`}>
              <h2 className="text-xl font-bold mb-6">Painel de Consumo (Tokens da OpenAI)</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                
                <div className={`p-6 rounded-xl border ${isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Custo Total Estimado</h3>
                  <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                    $ {financial.totalCost.toFixed(4)}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Dólares americanos cobrados na sua conta OpenAI.</p>
                </div>

                <div className={`p-6 rounded-xl border ${isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Tokens Trafegados</h3>
                  <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {financial.totalTokens.toLocaleString('pt-BR')}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Soma de Prompt (Entrada) + Completion (Saída)</p>
                </div>

                <div className={`p-6 rounded-xl border ${isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Interações com IA</h3>
                  <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                    {financial.interactions}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Vezes que a IA foi ativada nesta conta.</p>
                </div>

              </div>

              <div className={`p-4 rounded-lg text-sm border ${isDark ? 'bg-yellow-900/20 border-yellow-800/50 text-yellow-300' : 'bg-yellow-50 border-yellow-200 text-yellow-800'}`}>
                <strong>Nota sobre custos:</strong> Os cálculos são estimativas com base na precificação pública da OpenAI para os modelos utilizados e são atualizados toda vez que o Agente envia uma mensagem. O Whisper (Transcrição) e a ElevenLabs possuem painéis de faturamento separados nos seus respectivos sites.
              </div>

           </div>
        )}

      </div>
    </div>
  );
}

export default function AiSettingsPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <AiSettingsContent />
    </Suspense>
  );
}
