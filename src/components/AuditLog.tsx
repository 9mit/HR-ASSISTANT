import React from 'react';
import { motion } from 'motion/react';
import { CandidateAudit, ScoreFactor } from '../types';
import { ShieldCheck, Target, CheckCircle2, Briefcase, Github, Award } from 'lucide-react';

export function AuditLog({ audit }: { audit: CandidateAudit | string | null | undefined }) {
  if (typeof audit === 'string' || !audit) {
    return (
      <div className="bg-stone-900/50 border border-stone-800 rounded-2xl p-8">
        <p className="text-stone-300 leading-relaxed">
          {typeof audit === 'string' ? audit : 'Audit trail not available for this candidate.'}
        </p>
      </div>
    );
  }

  const getIcon = (factor: string) => {
    switch (factor.toLowerCase()) {
      case 'skill': return CheckCircle2;
      case 'experience': return Briefcase;
      case 'project_quality': return Github;
      case 'certifications': return Award;
      default: return Target;
    }
  };

  const getColor = (factor: string) => {
    switch (factor.toLowerCase()) {
      case 'skill': return 'text-emerald-400';
      case 'experience': return 'text-cyan-400';
      case 'project_quality': return 'text-amber-400';
      case 'certifications': return 'text-emerald-400';
      default: return 'text-cyan-400';
    }
  };

  const getBg = (factor: string) => {
    switch (factor.toLowerCase()) {
      case 'skill': return 'bg-emerald-500/10';
      case 'experience': return 'bg-cyan-500/10';
      case 'project_quality': return 'bg-amber-500/10';
      case 'certifications': return 'bg-emerald-500/10';
      default: return 'bg-cyan-500/10';
    }
  };

  const timeline = [
    { 
      icon: Target, 
      title: 'Audit Overview', 
      content: audit.overview || 'General evaluation overview.', 
      color: 'text-cyan-400', 
      bg: 'bg-cyan-500/10', 
      border: 'border-cyan-500/20' 
    },
    ...(audit.factor_contributions || []).map((factor: ScoreFactor) => ({
      icon: getIcon(factor.factor),
      title: factor.factor.charAt(0).toUpperCase() + factor.factor.slice(1).replace('_', ' '),
      content: factor.explanation,
      color: getColor(factor.factor),
      bg: getBg(factor.factor),
      border: `border-white/5`
    }))
  ];

  return (
    <div className="relative space-y-8 before:absolute before:inset-0 before:ml-6 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-stone-850 before:to-transparent">
      {timeline.map((item, i) => (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
          key={i} 
          className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
        >
          <div className="flex items-center justify-center w-11 h-11 rounded-full border-4 border-stone-950 bg-stone-900 text-stone-500 group-[.is-active]:text-stone-50 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
            <div className={`w-full h-full rounded-full flex items-center justify-center ${item.bg} ${item.border} border`}>
              <item.icon className={`w-4.5 h-4.5 ${item.color}`} />
            </div>
          </div>
          <div className="w-[calc(100%-3.5rem)] md:w-[calc(50%-2.5rem)] p-5 rounded-2xl glass-panel-interactive shadow-lg">
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="font-display font-semibold text-xs text-stone-200 uppercase tracking-wider">{item.title}</h4>
            </div>
            <p className="text-xs md:text-sm text-stone-400 leading-relaxed">{item.content}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
