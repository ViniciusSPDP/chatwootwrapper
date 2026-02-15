'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

interface ScheduledMessage {
  id: string;
  content: string;
  scheduledAt: string;
  status: string;
}

function SchedulePageContent() {
  const searchParams = useSearchParams();
  const conversationId = searchParams.get('conversationId');
  const accountId = searchParams.get('accountId');
  const token = searchParams.get('token');
  const chatwootUrl = searchParams.get('chatwootUrl');
  const client = searchParams.get('client');
  const uid = searchParams.get('uid');

  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [newDate, setNewDate] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (conversationId) {
      fetchMessages();
    }
  }, [conversationId]);

  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/schedule?conversationId=${conversationId}`);
      const data = await res.json();
      if (data.success) {
        setMessages(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage || !newDate) return;

    try {
      if (editingId) {
        // Edit
        await fetch(`/api/schedule/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: newMessage, scheduledAt: new Date(newDate).toISOString() }),
        });
        setEditingId(null);
      } else {
        // Create
        await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: newMessage,
            scheduledAt: new Date(newDate).toISOString(), // Importante: converter para ISO (UTC)
            conversationId,
            accountId,
            token,
            client, // Header adicional
            uid,    // Header adicional
            chatwootUrl,
          }),
        });
      }

      setNewMessage('');
      setNewDate('');
      fetchMessages();
    } catch (err) {
      alert('Error saving message');
    }
  };

  const handleEdit = (msg: ScheduledMessage) => {
    setEditingId(msg.id);
    setNewMessage(msg.content);

    // Ajustar UTC do banco para Local Time do Input
    const date = new Date(msg.scheduledAt);
    const localIso = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    setNewDate(localIso);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure?')) return;
    try {
      await fetch(`/api/schedule/${id}`, { method: 'DELETE' });
      fetchMessages();
    } catch (err) {
      alert('Error deleting message');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setNewMessage('');
    setNewDate('');
  };

  if (!conversationId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-zinc-950 p-4">
        <div className="bg-white dark:bg-zinc-900 p-8 rounded-xl shadow-lg text-center max-w-md w-full border border-gray-100 dark:border-zinc-800">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Acesso Inválido</h2>
          <p className="text-gray-500 dark:text-gray-400">
            Por favor, abra esta página através da conversa no Chatwoot.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 py-8 px-4 sm:px-6 lg:px-8 font-sans transition-colors duration-200">
      <div className="max-w-2xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden">
          <div className="bg-emerald-600 px-6 py-8 sm:px-10">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <span>📅</span> Agendar Mensagem
            </h2>
            <p className="text-emerald-100 mt-2 text-sm sm:text-base">
              Programe mensagens automáticas para esta conversa.
            </p>
          </div>

          <div className="p-6 sm:p-10">
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Message Input */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Mensagem
                </label>
                <textarea
                  className="w-full p-4 border border-gray-200 dark:border-zinc-700 rounded-xl bg-gray-50 dark:bg-zinc-800/50 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 min-h-[120px] resize-y text-base"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Digite o conteúdo da mensagem aqui..."
                  required
                />
              </div>

              {/* Date Input */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Data e Hora
                </label>
                <div className="relative">
                  <input
                    type="datetime-local"
                    className="w-full p-4 border border-gray-200 dark:border-zinc-700 rounded-xl bg-gray-50 dark:bg-zinc-800/50 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 text-base appearance-none"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    required
                  />
                  {/* Icon hint could go here, but browser native picker usually has one */}
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  O horário será ajustado automaticamente para o fuso horário correto.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                {editingId && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 dark:bg-zinc-800 dark:text-gray-300 dark:border-zinc-600 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 shadow-md hover:shadow-lg transition-all transform active:scale-95"
                >
                  {editingId ? 'Atualizar Agendamento' : 'Agendar Mensagem'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Message List Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white px-1">
            Agendamentos ({messages.length})
          </h3>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 rounded-xl p-8 text-center border border-dashed border-gray-300 dark:border-zinc-700">
              <p className="text-gray-500 dark:text-gray-400">Nenhum agendamento encontrado.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className="group bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow duration-200 relative overflow-hidden"
                >
                  {/* Status Indicator Bar */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                    msg.status === 'SENT' ? 'bg-emerald-500' : 
                    msg.status === 'FAILED' ? 'bg-red-500' : 'bg-amber-400'
                  }`} />

                  <div className="pl-3">
                    <div className="flex justify-between items-start mb-3 gap-4">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          msg.status === 'SENT' 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-900/50' 
                            : msg.status === 'FAILED'
                            ? 'bg-red-50 text-red-700 border-red-100 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900/50'
                            : 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900/50'
                        }`}>
                          {msg.status === 'SENT' ? 'Enviado' : msg.status === 'FAILED' ? 'Falhou' : 'Pendente'}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                          {new Date(msg.scheduledAt).toLocaleString(undefined, { 
                            dateStyle: 'short', 
                            timeStyle: 'short' 
                          })}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEdit(msg)}
                          disabled={msg.status === 'SENT'}
                          className="p-1.5 text-gray-500 hover:text-emerald-600 disabled:opacity-30 disabled:hover:text-gray-500 rounded-md hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                          title="Editar"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button
                          onClick={() => handleDelete(msg.id)}
                          className="p-1.5 text-gray-500 hover:text-red-600 rounded-md hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                          title="Excluir"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                      </div>
                    </div>
                    
                    <p className="text-gray-800 dark:text-gray-200 text-sm whitespace-pre-wrap leading-relaxed line-clamp-3 hover:line-clamp-none transition-all">
                      {msg.content}
                    </p>
                    
                    {msg.status === 'FAILED' && (
                      <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg">
                        <p className="text-xs text-red-600 dark:text-red-400 font-mono">
                          {/* We don't have errorLog in the interface, but assuming it might be extended later. For now just show generic error. */}
                          Erro ao enviar mensagem.
                        </p>
                      </div>
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

export default function SchedulePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SchedulePageContent />
    </Suspense>
  );
}
