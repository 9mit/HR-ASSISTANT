import React, { useEffect, useState } from 'react';
import { Candidate } from '../types';
import { Loader2, Mail, Users, Send } from 'lucide-react';

interface RejectedPanelProps {
  onSelectCandidate: (c: Candidate) => void;
}

export function RejectedPanel({ onSelectCandidate }: RejectedPanelProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '');

  const loadRejected = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${apiUrl}/api/pool/candidates?decision=rejected`);
      if (!res.ok) throw new Error('Failed to fetch rejected candidates');
      const data = await res.json();
      setCandidates(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRejected();
  }, []);

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

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-rose-400" /></div>;
  if (error) return <div className="p-10 text-rose-400">Error: {error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-stone-950/80 p-6 rounded-2xl border border-stone-800 border-l-4 border-l-rose-500">
        <div>
          <h2 className="text-xl font-semibold text-stone-100 flex items-center gap-2">
            <Mail className="w-5 h-5 text-rose-400" />
            Rejected Candidates
          </h2>
          <p className="text-sm text-stone-400 mt-1">Send a single email to BCC all rejected candidates instantly.</p>
        </div>
        <button 
          onClick={handleMassReject}
          disabled={candidates.length === 0}
          className="flex items-center gap-2 bg-stone-100 hover:bg-white text-stone-950 px-6 py-2.5 rounded-xl font-medium disabled:opacity-50 transition-all shadow-lg"
        >
          <Send className="w-4 h-4" />
          Send Mass Rejection ({candidates.length})
        </button>
      </div>

      {candidates.length > 0 ? (
        <div className="bg-stone-950 border border-stone-800 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-sm text-stone-300">
            <thead className="bg-stone-900 border-b border-stone-800 text-xs uppercase tracking-wider text-stone-400">
              <tr>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Score</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/50">
              {candidates.map(candidate => (
                <tr key={candidate.id} className="hover:bg-stone-900/30">
                  <td className="px-6 py-4 font-medium text-stone-200">{candidate.name || candidate.alias}</td>
                  <td className="px-6 py-4 text-stone-400 font-mono text-xs">{candidate.email || 'N/A'}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center rounded-full bg-stone-800 px-2.5 py-0.5 text-xs font-medium text-rose-400 border border-rose-400/20">
                      {candidate.score.toFixed(1)}%
                    </span>
                  </td>
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
          <p className="text-stone-500">No rejected candidates yet.</p>
        </div>
      )}
    </div>
  );
}
