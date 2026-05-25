import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Candidate } from '../types';
import { Loader2, Mail, Send, ChevronRight } from 'lucide-react';
import { buildApiHeaders, getApiUrl } from '../api';

interface RejectedPanelProps {
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

export function RejectedPanel({ onSelectCandidate }: RejectedPanelProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = getApiUrl();

  const loadRejected = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${apiUrl}/api/pool/candidates?decision=rejected`, {
        headers: buildApiHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch rejected candidates');
      const data = await res.json();
      setCandidates(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    loadRejected();
  }, [loadRejected]);

  const handleMassReject = () => {
    const emails = candidates.map(c => c.email).filter(Boolean).join(',');
    if (!emails) {
      alert("No email addresses found for the rejected candidates.");
      return;
    }

    // Default rejection template
    const subject = encodeURIComponent("Update on your application");
    const body = encodeURIComponent(
      "Thank you for your interest in our position.\n\nAfter careful consideration of your application, we have decided to move forward with other candidates whose qualifications more closely match our current needs.\n\nWe appreciate the time you invested in our process and encourage you to apply for future openings that align with your skills and experience.\n\nBest regards,\nHiring Team"
    );

    const mailtoLink = `mailto:?bcc=${emails}&subject=${subject}&body=${body}`;
    window.open(mailtoLink, '_blank');
  };

  if (loading) {
    return (
      <div className="p-20 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-rose-400 text-glow-rose" />
        <span className="text-stone-500 font-medium text-sm">Loading rejected pool...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-10 text-center glass-panel rounded-2xl border border-rose-500/20 bg-rose-950/10">
        <p className="text-rose-400 font-semibold text-sm">Error: {error}</p>
        <button 
          onClick={loadRejected}
          className="mt-4 px-4 py-2 bg-stone-900 border border-stone-850 rounded-xl text-stone-300 hover:bg-stone-850 transition-colors text-xs font-semibold"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between glass-panel p-6 rounded-[2rem] shadow-xl shadow-black/30 gap-4 border-l-4 border-l-rose-500/80">
        <div>
          <h2 className="text-xl font-display font-semibold text-stone-100 flex items-center gap-2">
            <Mail className="w-5 h-5 text-rose-450" />
            Rejected Candidates
          </h2>
          <p className="text-xs md:text-sm text-stone-400 mt-1">Send a batch email to BCC all rejected candidates in one click.</p>
        </div>
        <button 
          onClick={handleMassReject}
          disabled={candidates.length === 0}
          className="relative overflow-hidden group bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-450 hover:to-orange-450 text-stone-950 px-6 py-3 rounded-xl font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_25px_rgba(244,63,94,0.2)] hover:shadow-[0_0_35px_rgba(244,63,94,0.4)] flex items-center justify-center gap-2 cursor-pointer"
        >
          <Send className="w-4 h-4 text-stone-950" />
          <span>Send Mass Rejection</span>
          <span className="bg-stone-950/20 px-2 py-0.5 rounded-md text-[10px] font-black tracking-wider">
            {candidates.length}
          </span>
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
            <table className="w-full text-left text-sm text-stone-300 min-w-[600px] border-collapse">
              <thead className="bg-stone-900/30 border-b border-stone-850/60 text-[10px] uppercase tracking-[0.15em] text-stone-500 font-bold">
                <tr>
                  <th className="px-8 py-4.5">Candidate Details</th>
                  <th className="px-6 py-4.5">Email</th>
                  <th className="px-6 py-4.5">Match Score</th>
                  <th className="px-8 py-4.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-850/50">
                {candidates.map((candidate) => (
                  <motion.tr 
                    variants={rowVariants}
                    key={candidate.id} 
                    className="group transition-all duration-300 hover:bg-stone-900/20"
                  >
                    <td className="px-8 py-5 align-middle">
                      <span className="font-display font-semibold text-stone-200 group-hover:text-rose-400 transition-colors text-sm md:text-base">
                        {candidate.name || candidate.alias}
                      </span>
                    </td>
                    <td className="px-6 py-5 align-middle text-xs text-stone-400 font-mono">
                      {candidate.email || 'No email provided'}
                    </td>
                    <td className="px-6 py-5 align-middle">
                      <span className="inline-flex items-center rounded-xl bg-stone-900/40 px-3 py-1.5 text-xs font-semibold text-rose-400 border border-rose-500/10">
                        {candidate.score.toFixed(1)}%
                      </span>
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
          <Mail className="w-8 h-8 text-stone-600" />
          <p className="text-stone-500 text-sm max-w-sm">No rejected candidates yet.</p>
        </div>
      )}
    </div>
  );
}
