import React from 'react';
import { motion } from 'motion/react';
import { Candidate } from '../types';
import { AlertCircle, ChevronRight, FileText, GitFork, Github, ShieldCheck } from 'lucide-react';

interface CandidateTableProps {
  candidates: Candidate[];
  onSelect: (candidate: Candidate) => void;
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

export function CandidateTable({ candidates, onSelect }: CandidateTableProps) {
  const decisionTone: Record<string, string> = {
    shortlist: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
    review: 'border-cyan-500/20 bg-cyan-500/5 text-cyan-400',
    rejected: 'border-stone-800 bg-stone-900/40 text-stone-400',
    needs_clarification: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
    salary_mismatch: 'border-rose-500/20 bg-rose-500/5 text-rose-400',
    invalid: 'border-rose-500/20 bg-rose-500/5 text-rose-400',
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="overflow-hidden rounded-[2rem] glass-panel shadow-xl shadow-black/45"
    >
      <div className="flex items-center justify-between border-b border-stone-850 bg-stone-900/30 px-8 py-5">
        <div>
          <h2 className="font-display text-xl font-semibold text-stone-100">Anonymized Candidate Ranking</h2>
          <p className="mt-1 text-xs text-stone-500">Table view hides direct identifiers so ranking remains merit-first.</p>
        </div>
        <span className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-1 text-xs font-semibold text-emerald-400">
          {candidates.length} candidates
        </span>
      </div>
      
      <div className="divide-y divide-stone-850/60">
        {candidates.map((candidate, index) => (
          <motion.div 
            variants={item}
            key={candidate.id} 
            onClick={() => onSelect(candidate)}
            className="group cursor-pointer p-6 transition-all hover:bg-stone-900/20"
          >
            <div className="flex flex-col justify-between gap-8 md:flex-row">
              <div className="flex-1">
                <div className="mb-4 flex flex-wrap items-center gap-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/5 text-base font-bold text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.1)]">
                    #{index + 1}
                  </span>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-stone-100 transition-colors group-hover:text-cyan-300">
                      {candidate.alias}
                    </h3>
                    <p className="text-[11px] text-stone-500">Identity revealed only inside the post-score profile.</p>
                  </div>
                  <span className={`rounded-xl border px-3 py-1 text-[9px] font-bold uppercase tracking-[0.2em] ${decisionTone[candidate.decision] || decisionTone.review}`}>
                    {candidate.decision.replace('_', ' ')}
                  </span>
                  {candidate.github_url && (
                    <a
                      href={candidate.github_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-stone-500 transition-colors hover:text-stone-300"
                    >
                      <Github className="h-4.5 w-4.5" />
                    </a>
                  )}
                </div>
                
                {candidate.error ? (
                  <div className="mb-5 inline-flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-rose-300">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-xs font-semibold">{candidate.error}</span>
                  </div>
                ) : (
                  <p className="mb-4 max-w-3xl text-sm leading-relaxed text-stone-400">{candidate.summary}</p>
                )}
                
                <div className="mb-4 flex flex-wrap gap-2">
                  {candidate.skills?.slice(0, 6).map((skill, i) => (
                    <span key={i} className="rounded-lg border border-stone-850 bg-stone-900/30 px-2.5 py-1 text-[11px] font-medium text-stone-300">
                      {skill}
                    </span>
                  ))}
                  {candidate.skills?.length > 6 && (
                    <span className="rounded-lg border border-stone-850 bg-stone-950 px-2.5 py-1 text-[11px] font-medium text-stone-500">
                      +{candidate.skills.length - 6} more
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-3 text-[11px] text-stone-500">
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-stone-850 bg-stone-900/20 px-2.5 py-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                    Salary gate: {candidate.salary_status.replace('_', ' ')}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-stone-850 bg-stone-900/20 px-2.5 py-1">
                    <FileText className="h-3.5 w-3.5 text-amber-400" />
                    {candidate.file_name}
                  </span>
                  {candidate.merged_duplicate_ids.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-stone-850 bg-stone-900/20 px-2.5 py-1">
                      <GitFork className="h-3.5 w-3.5 text-cyan-400" />
                      {candidate.merged_duplicate_ids.length} duplicates merged
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex min-w-[180px] flex-col items-end justify-center">
                <div className="mb-4 text-right">
                  {candidate.error ? (
                    <div className="font-display text-xl font-bold text-rose-400">Invalid</div>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="font-display text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-emerald-300 to-cyan-300">
                        {candidate.score.toFixed(1)}
                      </span>
                      <span className="text-lg font-medium text-stone-600">/100</span>
                    </div>
                  )}
                  <div className="mt-1 text-[9px] font-semibold uppercase tracking-widest text-stone-500">Match Score</div>
                </div>
                
                <div className="flex -translate-x-4 items-center gap-1 text-xs font-semibold text-cyan-400 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
                  View Profile <ChevronRight className="h-3.5 w-3.5" />
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
