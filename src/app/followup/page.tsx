'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

interface FollowUp {
  id: string;
  note: string;
  scheduledAt: string;
  status: string;
}

function FollowUpPageContent() {
  const searchParams = useSearchParams();
  const conversationId = searchParams.get('conversationId');
  const accountId = searchParams.get('accountId');
  const token = searchParams.get('token');
  const chatwootUrl = searchParams.get('chatwootUrl');

  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    if (conversationId) {
      fetchFollowUps();
    }
  }, [conversationId]);

  const fetchFollowUps = async () => {
    try {
      const res = await fetch(`/api/followup?conversationId=${conversationId}`);
      const data = await res.json();
      if (data.success) {
        setFollowUps(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note || !date) return;

    try {
      await fetch('/api/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note,
          scheduledAt: date,
          conversationId,
          accountId,
          token,
          chatwootUrl
        }),
      });

      setNote('');
      setDate('');
      fetchFollowUps();
    } catch (err) {
      alert('Error saving follow-up');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure?')) return;
    try {
      await fetch(`/api/followup/${id}`, { method: 'DELETE' });
      fetchFollowUps();
    } catch (err) {
      alert('Error deleting');
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await fetch(`/api/followup/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchFollowUps();
    } catch (err) {
      alert('Error updating status');
    }
  };

  if (!conversationId) return <div className="p-4">Please open from a conversation.</div>;

  return (
    <div className="p-4 max-w-lg mx-auto font-sans dark:text-gray-100">
      <h2 className="text-xl font-bold mb-4">🔔 Set Follow-up</h2>

      <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-800">
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note</label>
          <input
            type="text"
            className="w-full p-2 border rounded-md text-sm dark:bg-zinc-800 dark:border-zinc-700 dark:text-gray-100"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Call back tomorrow..."
            required
          />
        </div>
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date & Time</label>
          <input
            type="datetime-local"
            className="w-full p-2 border rounded-md text-sm dark:bg-zinc-800 dark:border-zinc-700 dark:text-gray-100"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-3 py-1.5 text-sm bg-indigo-500 text-white rounded hover:bg-indigo-600"
          >
            Set Reminder
          </button>
        </div>
      </form>

      <h3 className="text-lg font-semibold mb-2">Upcoming Follow-ups</h3>
      {loading ? (
        <p>Loading...</p>
      ) : followUps.length === 0 ? (
        <p className="text-gray-500 text-sm">No follow-ups.</p>
      ) : (
        <div className="space-y-3">
          {followUps.map((item) => (
            <div key={item.id} className={`p-3 border rounded-lg shadow-sm ${item.status === 'DONE' ? 'bg-gray-100 dark:bg-zinc-800 opacity-70' : 'bg-white dark:bg-zinc-900'} dark:border-zinc-800`}>
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                  {new Date(item.scheduledAt).toLocaleString()}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded ${item.status === 'DONE' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'}`}>
                  {item.status}
                </span>
              </div>
              <p className="text-sm text-gray-800 dark:text-gray-200 mb-2">{item.note}</p>
              <div className="flex justify-end gap-2">
                {item.status !== 'DONE' && (
                  <button
                    onClick={() => handleStatusChange(item.id, 'DONE')}
                    className="text-xs text-green-600 hover:underline dark:text-green-400"
                  >
                    Mark Done
                  </button>
                )}
                <button
                  onClick={() => handleDelete(item.id)}
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

export default function FollowUpPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <FollowUpPageContent />
    </Suspense>
  );
}
