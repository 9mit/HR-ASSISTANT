import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Candidate } from '../types';
import { Loader2, Users, Check, ChevronRight } from 'lucide-react';

interface PoolPanelProps {
  onSelectCandidate: (c: Candidate) => void;
}

const tableContainerVariants = {
  hidden: { opacity: 0, y: 15 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      staggerChildren: 0.05
    }
  }
};

const rowVariants = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0, transition: { duration: 0.3 } }
};

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
      setShortlistedIds(new Set());
    } catch (e: any) {
      alert(e.message);
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-20 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-emerald-400 text-glow-emerald" />
        <span className="text-stone-500 font-medium text-sm">Loading candidates under consideration...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-10 text-center glass-panel rounded-2xl border border-rose-500/20 bg-rose-950/10">
        <p className="text-rose-400 font-semibold text-sm">Error: {error}</p>
        <button 
          onClick={loadPool}
          className="mt-4 px-4 py-2 bg-stone-900 border border-stone-850 rounded-xl text-stone-300 hover:bg-stone-850 transition-colors text-xs font-semibold"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between glass-panel p-6 rounded-[2rem] shadow-xl shadow-black/30 gap-4">
        <div>
          <h2 className="text-xl font-display font-semibold text-stone-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400 text-glow-emerald" />
            Under Consideration Pool
          </h2>
          <p className="text-xs md:text-sm text-stone-400 mt-1">Select the top candidates you want to shortlist for the final evaluation.</p>
        </div>
        <button 
          onClick={finalizePool}
          disabled={finalizing || candidates.length === 0}
          className="relative overflow-hidden group bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-stone-950 px-6 py-3 rounded-xl font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_25px_rgba(16,185,129,0.25)] hover:shadow-[0_0_35px_rgba(16,185,129,0.45)] flex items-center justify-center gap-2 cursor-pointer"
        >
          {finalizing ? (
            <Loader2 className="w-4 h-4 animate-spin text-stone-950" />
          ) : (
            <>
              <span>Finalize & Shortlist</span>
              <span className="bg-stone-950/20 px-2 py-0.5 rounded-md text-[10px] font-black tracking-wider">
                {shortlistedIds.size}
              </span>
            </>
          )}
        </button>
      </div>

      {candidates.length > 0 ? (
        <motion.div 
          variants={tableContainerVariants}
          initial="hidden"
          animate="show"
          className="overflow-hidden rounded-[2rem] glass-panel shadow-xl shadow-black/45"
        >
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-stone-300 min-w-[700px] border-collapse">
              <thead className="bg-stone-900/30 border-b border-stone-850/60 text-[10px] uppercase tracking-[0.15em] text-stone-500 font-bold">
                <tr>
                  <th className="px-8 py-4.5 w-20">Shortlist</th>
                  <th className="px-6 py-4.5">Candidate Details</th>
                  <th className="px-6 py-4.5">Match Score</th>
                  <th className="px-6 py-4.5">Experience</th>
                  <th className="px-8 py-4.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-850/50">
                {candidates.map((candidate) => (
                  <motion.tr 
                    variants={rowVariants}
                    key={candidate.id} 
                    className={`group transition-all duration-300 hover:bg-stone-900/20 ${
                      shortlistedIds.has(candidate.id) 
                        ? 'bg-emerald-500/[0.03] border-l-2 border-l-emerald-500' 
                        : 'border-l-2 border-l-transparent'
                    }`}
                  >
                    <td className="px-8 py-5 align-middle">
                      <button
                        onClick={() => toggleShortlist(candidate.id)}
                        className={`flex h-5 w-5 items-center justify-center rounded-md border transition-all cursor-pointer ${
                          shortlistedIds.has(candidate.id)
                            ? 'border-emerald-500 bg-emerald-500 text-stone-950 shadow-[0_0_10px_rgba(16,185,129,0.35)]'
                            : 'border-stone-700 bg-stone-900/50 text-transparent hover:border-emerald-500/50'
                        }`}
                      >
                        <Check className="h-3.5 w-3.5 stroke-[3px]" />
                      </button>
                    </td>
                    <td className="px-6 py-5 align-middle">
                      <div className="flex flex-col">
                        <span className="font-display font-semibold text-stone-200 group-hover:text-cyan-300 transition-colors text-sm md:text-base">
                          {candidate.name || candidate.alias}
                        </span>
                        <span className="text-xs text-stone-500 font-mono mt-0.5">
                          {candidate.email || 'No email provided'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 align-middle">
                      <span className="inline-flex items-center rounded-xl bg-stone-900/40 px-3 py-1.5 text-xs font-semibold text-emerald-400 border border-emerald-500/10">
                        {candidate.score.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-5 align-middle text-xs font-medium text-stone-400">
                      {candidate.experience_years ?? 0} years experience
                    </td>
                    <td className="px-8 py-5 align-middle text-right">
                      <button 
                        onClick={() => onSelectCandidate(candidate)}
                        className="inline-flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 text-xs uppercase tracking-wider font-bold transition-all group-hover:translate-x-1 duration-300 cursor-pointer"
                      >
                        View Profile <ChevronRight className="h-4 w-4" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      ) : (
        <div className="p-16 text-center border border-dashed border-stone-850 rounded-[2rem] bg-stone-950/20 flex flex-col items-center justify-center gap-3">
          <Users className="w-8 h-8 text-stone-600" />
          <p className="text-stone-500 text-sm max-w-sm">Your pool is empty. Upload candidate batches and place potential hires under consideration!</p>
        </div>
      )}
    </div>
  );
}
