import React, { useCallback, useEffect, useState } from 'react';
import { Candidate } from '../types';
import { Loader2, Users } from 'lucide-react';

interface PoolPanelProps {
  onSelectCandidate: (c: Candidate) => void;
}

export function PoolPanel({ onSelectCandidate }: PoolPanelProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shortlistedIds, setShortlistedIds] = useState<Set<string>>(new Set());
  const [finalizing, setFinalizing] = useState(false);

  const apiUrl = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '');

  const loadPool = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${apiUrl}/api/pool/candidates?decision=under_consideration`);
      if (!res.ok) throw new Error('Failed to fetch pool');
      const data = await res.json();
      setCandidates(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    loadPool();
  }, [loadPool]);

  const toggleShortlist = (id: string) => {
    setShortlistedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const finalizePool = async () => {
    if (!confirm('Are you sure? This will shortlist the selected candidates and reject everyone else in the pool!')) return;
    
    setFinalizing(true);
    try {
      const res = await fetch(`${apiUrl}/api/pool/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortlisted_ids: Array.from(shortlistedIds) })
      });
      if (!res.ok) throw new Error('Failed to finalize pool');
      alert('Pool finalized successfully!');
      setCandidates([]); // Clear pool since everyone is now shortlisted or rejected
    } catch (e: any) {
      alert(e.message);
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-400" /></div>;
  if (error) return <div className="p-10 text-rose-400">Error: {error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-stone-950/80 p-6 rounded-2xl border border-stone-800">
        <div>
          <h2 className="text-xl font-semibold text-stone-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            Under Consideration Pool
          </h2>
          <p className="text-sm text-stone-400 mt-1">Select the top candidates you want to shortlist.</p>
        </div>
        <button 
          onClick={finalizePool}
          disabled={finalizing || candidates.length === 0}
          className="bg-emerald-500 hover:bg-emerald-600 text-stone-950 px-6 py-2.5 rounded-xl font-medium disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]"
        >
          {finalizing ? <Loader2 className="w-5 h-5 animate-spin" /> : `Finalize & Shortlist (${shortlistedIds.size})`}
        </button>
      </div>

      {candidates.length > 0 ? (
        <div className="bg-stone-950 border border-stone-800 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-sm text-stone-300">
            <thead className="bg-stone-900 border-b border-stone-800 text-xs uppercase tracking-wider text-stone-400">
              <tr>
                <th className="px-6 py-4">Shortlist</th>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Score</th>
                <th className="px-6 py-4">Experience</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/50">
              {candidates.map(candidate => (
                <tr key={candidate.id} className={`hover:bg-stone-900/30 ${shortlistedIds.has(candidate.id) ? 'bg-emerald-500/5' : ''}`}>
                  <td className="px-6 py-4">
                    <input 
                      type="checkbox" 
                      checked={shortlistedIds.has(candidate.id)} 
                      onChange={() => toggleShortlist(candidate.id)}
                      className="w-5 h-5 rounded border-stone-700 bg-stone-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-stone-950"
                    />
                  </td>
                  <td className="px-6 py-4 font-medium text-stone-200">{candidate.name || candidate.alias}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center rounded-full bg-stone-800 px-2.5 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-400/20">
                      {candidate.score.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-stone-400">{candidate.experience_years ?? 0} yrs</td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => onSelectCandidate(candidate)}
                      className="text-stone-400 hover:text-stone-200 text-xs uppercase tracking-wider font-medium"
                    >
                      View Profile
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-12 text-center border border-dashed border-stone-800 rounded-2xl bg-stone-950/50">
          <p className="text-stone-500">Your pool is empty. Upload batches and move candidates here!</p>
        </div>
      )}
    </div>
  );
}
