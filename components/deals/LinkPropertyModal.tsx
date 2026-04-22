'use client';

import { useState } from 'react';
import type { PropertyEntry } from '@/lib/models/portfolio';

interface Props {
  dealId: string;
  dealName: string;
  currentPropertyId?: string;
  properties: PropertyEntry[];
  onLinked: (propertyId: string, propertyName: string) => void;
  onUnlinked: () => void;
  onClose: () => void;
}

export default function LinkPropertyModal({
  dealId,
  dealName,
  currentPropertyId,
  properties,
  onLinked,
  onUnlinked,
  onClose,
}: Props) {
  const [mode, setMode] = useState<'pick' | 'create'>('pick');
  const [newName, setNewName] = useState(dealName);
  const [newAddress, setNewAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const filtered = properties.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.address ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  async function linkToProperty(propertyId: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, status: 'converted' }),
      });
      if (!res.ok) throw new Error('Failed to link');
      const prop = properties.find(p => p.id === propertyId);
      onLinked(propertyId, prop?.name ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Link failed');
    } finally {
      setLoading(false);
    }
  }

  async function createAndLink() {
    if (!newName.trim()) return;
    setLoading(true);
    setError('');
    try {
      const createRes = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), address: newAddress.trim() || undefined }),
      });
      if (!createRes.ok) throw new Error('Failed to create property');
      const { property } = await createRes.json() as { property: PropertyEntry };
      await linkToProperty(property.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  async function unlink() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: null, status: 'analyzed' }),
      });
      if (!res.ok) throw new Error('Failed to unlink');
      onUnlinked();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unlink failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {currentPropertyId ? 'Change Property Link' : 'Link to Property'}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              Associate this deal with a portfolio property once acquired.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded" style={{ color: 'var(--muted)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
          {(['pick', 'create'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="flex-1 py-2.5 text-xs font-medium"
              style={{
                color: mode === m ? 'var(--accent)' : 'var(--muted)',
                borderBottom: mode === m ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              {m === 'pick' ? 'Existing Property' : 'Create New Property'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 text-xs px-3 py-2 rounded" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          {mode === 'pick' && (
            <>
              <input
                type="text"
                placeholder="Search properties…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input-field mb-3 text-sm"
              />
              {filtered.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: 'var(--muted)' }}>
                  {properties.length === 0 ? 'No properties yet. Create one below.' : 'No matching properties.'}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {filtered.map(p => (
                    <button
                      key={p.id}
                      onClick={() => linkToProperty(p.id)}
                      disabled={loading}
                      className="w-full text-left px-4 py-3 rounded-lg transition-colors"
                      style={{
                        backgroundColor: p.id === currentPropertyId ? 'rgba(37,99,235,0.08)' : 'var(--bg)',
                        border: `1px solid ${p.id === currentPropertyId ? 'rgba(37,99,235,0.3)' : 'var(--border)'}`,
                      }}
                    >
                      <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{p.name}</p>
                      {p.address && <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{p.address}</p>}
                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                        {p.statementCount} statement{p.statementCount !== 1 ? 's' : ''}
                        {p.id === currentPropertyId && <span style={{ color: 'var(--accent)' }}> · Currently linked</span>}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {mode === 'create' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>Property Name *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="input-field text-sm"
                  placeholder="e.g. 123 Main Street"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>Address (optional)</label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={e => setNewAddress(e.target.value)}
                  className="input-field text-sm"
                  placeholder="Full property address"
                />
              </div>
              <button
                onClick={createAndLink}
                disabled={loading || !newName.trim()}
                className="btn-primary w-full py-2.5 text-sm"
              >
                {loading ? 'Creating…' : 'Create Property & Link Deal'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {currentPropertyId && (
          <div className="px-5 py-3" style={{ borderTop: '1px solid var(--border)' }}>
            <button
              onClick={unlink}
              disabled={loading}
              className="w-full py-2 text-xs rounded"
              style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}
            >
              Unlink from property
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
