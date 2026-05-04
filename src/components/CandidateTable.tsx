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
    shortlist: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300',
    review: 'border-cyan-400/20 bg-cyan-500/10 text-cyan-300',
    rejected: 'border-stone-700 bg-stone-800/70 text-stone-300',
    needs_clarification: 'border-amber-400/20 bg-amber-500/10 text-amber-300',
    salary_mismatch: 'border-rose-400/20 bg-rose-500/10 text-rose-300',
    invalid: 'border-rose-400/20 bg-rose-500/10 text-rose-300',
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="overflow-hidden rounded-[2rem] border border-stone-800/70 bg-stone-950/80 shadow-[0_25px_80px_rgba(0,0,0,0.28)]"
    >
      <div className="flex items-center justify-between border-b border-stone-800/70 bg-stone-900/80 px-8 py-6">
        <div>
          <h2 className="font-display text-xl font-semibold text-stone-100">Anonymized Candidate Ranking</h2>
          <p className="mt-1 text-sm text-stone-500">Table view hides direct identifiers so ranking remains merit-first.</p>
        </div>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-300">
          {candidates.length} candidates
        </span>
      </div>
      
      <div className="divide-y divide-stone-800/70">
        {candidates.map((candidate, index) => (
          <motion.div 
            variants={item}
            key={candidate.id} 
            onClick={() => onSelect(candidate)}
            className="group cursor-pointer p-8 transition-colors hover:bg-stone-900/60"
          >
            <div className="flex flex-col justify-between gap-8 md:flex-row">
              <div className="flex-1">
                <div className="mb-4 flex flex-wrap items-center gap-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/10 text-lg font-bold text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.12)]">
                    #{index + 1}
                  </span>
                  <div>
                    <h3 className="font-display text-2xl font-semibold text-stone-100 transition-colors group-hover:text-cyan-200">
                      {candidate.alias}
                    </h3>
                    <p className="text-sm text-stone-500">Identity revealed only inside the post-score profile.</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${decisionTone[candidate.decision] || decisionTone.review}`}>
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
                      <Github className="h-5 w-5" />
                    </a>
                  )}
                </div>
                
                {candidate.error ? (
                  <div className="mb-5 inline-flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-rose-300">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">{candidate.error}</span>
                  </div>
                ) : (
                  <p className="mb-5 max-w-3xl text-sm leading-relaxed text-stone-400">{candidate.summary}</p>
                )}
                
                <div className="mb-4 flex flex-wrap gap-2">
                  {candidate.skills?.slice(0, 6).map((skill, i) => (
                    <span key={i} className="rounded-lg border border-stone-700/60 bg-stone-900/80 px-3 py-1 text-xs font-medium text-stone-300">
                      {skill}
                    </span>
                  ))}
                  {candidate.skills?.length > 6 && (
                    <span className="rounded-lg border border-stone-800 bg-stone-950 px-3 py-1 text-xs font-medium text-stone-500">
                      +{candidate.skills.length - 6} more
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-stone-500">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-800 bg-stone-900/70 px-3 py-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                    Salary gate: {candidate.salary_status.replace('_', ' ')}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-800 bg-stone-900/70 px-3 py-1">
                    <FileText className="h-3.5 w-3.5 text-amber-300" />
                    {candidate.file_name}
                  </span>
                  {candidate.merged_duplicate_ids.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-800 bg-stone-900/70 px-3 py-1">
                      <GitFork className="h-3.5 w-3.5 text-cyan-300" />
                      {candidate.merged_duplicate_ids.length} duplicates merged
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex min-w-[180px] flex-col items-end justify-center">
                <div className="mb-4 text-right">
                  {candidate.error ? (
                    <div className="font-display text-2xl font-bold text-rose-400">Invalid</div>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="font-display text-5xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-emerald-300 to-cyan-300">
                        {candidate.score.toFixed(1)}
                      </span>
                      <span className="text-xl font-medium text-stone-600">/100</span>
                    </div>
                  )}
                  <div className="mt-2 text-xs font-semibold uppercase tracking-widest text-stone-500">Match Score</div>
                </div>
                
                <div className="flex -translate-x-4 items-center gap-1 text-sm font-medium text-cyan-300 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
                  View Profile <ChevronRight className="h-4 w-4" />
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
