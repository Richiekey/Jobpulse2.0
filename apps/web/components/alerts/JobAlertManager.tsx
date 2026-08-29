'use client';

import React, { useState, useEffect } from 'react';

export interface JobAlertItem {
  id: string;
  title: string;
  query?: string | null;
  location?: string | null;
  frequency: string;
  channel: string;
  is_active: boolean;
  last_dispatched_at?: string | null;
  created_at: string;
}

export function JobAlertManager() {
  const [alerts, setAlerts] = useState<JobAlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/alerts');
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to load alerts.');
      }
      setAlerts(json.data.alerts || []);
    } catch (err: any) {
      setError(err?.message || 'Error loading alerts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const toggleAlert = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/alerts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      if (res.ok) {
        setAlerts((prev) =>
          prev.map((a) => (a.id === id ? { ...a, is_active: !currentActive } : a))
        );
      }
    } catch {
      // ignore
    }
  };

  const deleteAlert = async (id: string) => {
    if (!confirm('Are you sure you want to delete this job alert?')) return;
    try {
      const res = await fetch(`/api/alerts/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== id));
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <span>🔔</span>
            <span>Your Automated Job Alerts</span>
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Automated notifications delivered directly when matching verified jobs are ingested.
          </p>
        </div>
        <button
          onClick={fetchAlerts}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-500 text-sm">Loading job alerts...</div>
      ) : error ? (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm rounded-xl">
          {error}
        </div>
      ) : alerts.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-sm">
          No job alerts created yet. Search for roles and click &ldquo;Create Alert&rdquo; to stay notified.
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-center justify-between p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl hover:border-slate-700 transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-white text-sm">{alert.title}</span>
                  <span
                    className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                      alert.is_active
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {alert.is_active ? 'Active' : 'Paused'}
                  </span>
                </div>
                <div className="flex items-center space-x-4 text-xs text-slate-400">
                  {alert.query && <span>Keywords: <strong className="text-slate-300">{alert.query}</strong></span>}
                  {alert.location && <span>Location: <strong className="text-slate-300">{alert.location}</strong></span>}
                  <span>Frequency: <strong className="text-slate-300 uppercase">{alert.frequency}</strong></span>
                  <span>Channel: <strong className="text-slate-300 uppercase">{alert.channel}</strong></span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => toggleAlert(alert.id, alert.is_active)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    alert.is_active
                      ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30'
                      : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30'
                  }`}
                >
                  {alert.is_active ? 'Pause' : 'Resume'}
                </button>
                <button
                  onClick={() => deleteAlert(alert.id)}
                  className="px-3 py-1.5 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-semibold rounded-lg transition-colors"
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
