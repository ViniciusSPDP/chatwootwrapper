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
          body: JSON.stringify({ message: newMessage, scheduledAt: newDate }),
        });
        setEditingId(null);
      } else {
        // Create
        await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: newMessage,
            scheduledAt: newDate,
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
    setNewDate(new Date(msg.scheduledAt).toISOString().slice(0, 16));
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

  if (!conversationId) return <div className="p-4">Please open from a conversation.</div>;

  return (
    <div className="p-4 max-w-lg mx-auto font-sans dark:text-gray-100">
      <h2 className="text-xl font-bold mb-4">📅 Schedule Message</h2>

      <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-800">
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
          <textarea
            className="w-full p-2 border rounded-md h-24 text-sm dark:bg-zinc-800 dark:border-zinc-700 dark:text-gray-100"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            required
          />
        </div>
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date & Time</label>
          <input
            type="datetime-local"
            className="w-full p-2 border rounded-md text-sm dark:bg-zinc-800 dark:border-zinc-700 dark:text-gray-100"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            required
          />
        </div>
        <div className="flex justify-end gap-2">
           {editingId && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 dark:bg-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-600"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="px-3 py-1.5 text-sm bg-emerald-500 text-white rounded hover:bg-emerald-600"
          >
            {editingId ? 'Update' : 'Schedule'}
          </button>
        </div>
      </form>

      <h3 className="text-lg font-semibold mb-2">Scheduled Messages</h3>
      {loading ? (
        <p>Loading...</p>
      ) : messages.length === 0 ? (
        <p className="text-gray-500 text-sm">No scheduled messages.</p>
      ) : (
        <div className="space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className="p-3 bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-lg shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  {new Date(msg.scheduledAt).toLocaleString()}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded ${msg.status === 'SENT' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'}`}>
                  {msg.status}
                </span>
              </div>
              <p className="text-sm text-gray-800 dark:text-gray-200 mb-2 whitespace-pre-wrap">{msg.content}</p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => handleEdit(msg)}
                  className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                  disabled={msg.status === 'SENT'}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(msg.id)}
                  className="text-xs text-red-600 hover:underline dark:text-red-400"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
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
