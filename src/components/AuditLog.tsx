import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CandidateAudit, CounterfactualLever, ScoreFactor } from '../types';
import { Target, CheckCircle2, Briefcase, Github, Award, Sparkles, ArrowRight } from 'lucide-react';

function factorIcon(factor: string) {
  switch (factor.toLowerCase()) {
    case 'skill': return CheckCircle2;
    case 'experience': return Briefcase;
    case 'project_quality':
    case 'projects': return Github;
    case 'certifications': return Award;
    default: return Target;
  }
}

function factorColor(factor: string) {
  switch (factor.toLowerCase()) {
    case 'skill': return { text: 'text-emerald-400', bar: 'from-emerald-400 to-teal-400', track: 'bg-emerald-500/10' };
    case 'experience': return { text: 'text-cyan-400', bar: 'from-cyan-400 to-sky-400', track: 'bg-cyan-500/10' };
    case 'project_quality':
    case 'projects': return { text: 'text-amber-400', bar: 'from-amber-400 to-orange-400', track: 'bg-amber-500/10' };
    case 'certifications': return { text: 'text-emerald-400', bar: 'from-emerald-300 to-cyan-400', track: 'bg-emerald-500/10' };
    default: return { text: 'text-cyan-400', bar: 'from-cyan-400 to-teal-400', track: 'bg-cyan-500/10' };
  }
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function decisionTone(decision: string): string {
  switch (decision) {
    case 'shortlist': return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400';
    case 'review': return 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400';
    case 'needs_clarification':
    case 'salary_mismatch': return 'border-amber-500/20 bg-amber-500/10 text-amber-400';
    case 'rejected': return 'border-stone-700 bg-stone-900/50 text-stone-400';
    default: return 'border-stone-800 bg-stone-900/40 text-stone-400';
  }
}

function FactorBars({ factors }: { factors: ScoreFactor[] }) {
  const reduceMotion = useReducedMotion();

  if (!factors.length) return null;

  return (
    <div className="glass-panel rounded-2xl p-5 space-y-4" aria-label="Score factor breakdown">
      <h4 className="font-display font-semibold text-xs text-stone-200 uppercase tracking-wider">
        Factor scores
      </h4>
      <ul className="space-y-4">
        {factors.map((factor, index) => {
          const colors = factorColor(factor.factor);
          const width = clampScore(factor.raw_score);
          const title = factor.factor.charAt(0).toUpperCase() + factor.factor.slice(1).replace(/_/g, ' ');
          return (
            <li key={`${factor.factor}-${index}`}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className={`text-xs font-semibold ${colors.text}`}>{title}</span>
                <span className="text-[11px] tabular-nums text-stone-400">
                  {width.toFixed(1)}
                  <span className="text-stone-600">/100</span>
                  <span className="ml-2 text-stone-500">
                    · {(factor.weight * 100).toFixed(0)}% wt · {factor.contribution.toFixed(1)} contrib
                  </span>
                </span>
              </div>
              <div className={`h-2 w-full overflow-hidden rounded-full ${colors.track}`} role="presentation">
                <motion.div
                  className={`h-full rounded-full bg-gradient-to-r ${colors.bar}`}
                  initial={reduceMotion ? false : { width: 0 }}
                  animate={{ width: `${width}%` }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.45, delay: Math.min(index, 6) * 0.06, ease: 'easeOut' }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CounterfactualPanel({ levers }: { levers: CounterfactualLever[] }) {
  const reduceMotion = useReducedMotion();

  if (!levers.length) {
    return (
      <div className="glass-panel rounded-2xl p-5" aria-label="Counterfactual fit simulator">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <h4 className="font-display font-semibold text-xs text-stone-200 uppercase tracking-wider">
            What would change this outcome?
          </h4>
        </div>
        <p className="text-xs text-stone-500 leading-relaxed">
          No high-impact levers found — this profile is already near its ceiling for the current role band and skill set.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-5 space-y-4" aria-label="Counterfactual fit simulator">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <h4 className="font-display font-semibold text-xs text-stone-200 uppercase tracking-wider">
            What would change this outcome?
          </h4>
        </div>
        <p className="text-[11px] text-stone-500 leading-relaxed">
          Deterministic what-if predictions from the same ranking engine — not LLM advice.
        </p>
      </div>

      <ul className="space-y-3">
        {levers.map((lever, index) => {
          const deltaPositive = lever.delta >= 0;
          const deltaWidth = Math.min(100, Math.abs(lever.delta) * 2);
          return (
            <motion.li
              key={lever.id}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0 } : { delay: Math.min(index, 5) * 0.05 }}
              className="rounded-xl border border-stone-850 bg-stone-950/40 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-sm font-semibold text-stone-100">{lever.label}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-stone-500">{lever.category}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs tabular-nums text-stone-300">
                    {lever.current_score.toFixed(1)}
                    <ArrowRight className="inline mx-1 h-3 w-3 text-stone-600" />
                    <span className="text-emerald-400 font-semibold">{lever.predicted_score.toFixed(1)}</span>
                    <span className="text-stone-600">/100</span>
                  </p>
                  <p className={`text-[11px] font-semibold tabular-nums ${deltaPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {deltaPositive ? '+' : ''}{lever.delta.toFixed(1)} pts
                  </p>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                <span className={`rounded-lg border px-2 py-1 ${decisionTone(lever.current_decision)}`}>
                  {lever.current_decision.replace(/_/g, ' ')}
                </span>
                <ArrowRight className="h-3 w-3 text-stone-600" />
                <span className={`rounded-lg border px-2 py-1 ${decisionTone(lever.predicted_decision)}`}>
                  {lever.predicted_decision.replace(/_/g, ' ')}
                </span>
              </div>

              <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-900" role="presentation">
                <motion.div
                  className={`h-full rounded-full ${deltaPositive ? 'bg-gradient-to-r from-emerald-400 to-cyan-400' : 'bg-rose-400'}`}
                  initial={reduceMotion ? false : { width: 0 }}
                  animate={{ width: `${deltaWidth}%` }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.4, delay: Math.min(index, 5) * 0.05 }}
                />
              </div>

              <p className="text-xs text-stone-400 leading-relaxed">{lever.explanation}</p>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

export function AuditLog({
  audit,
  counterfactuals = [],
}: {
  audit: CandidateAudit | string | null | undefined;
  counterfactuals?: CounterfactualLever[];
}) {
  const reduceMotion = useReducedMotion();
  const levers = counterfactuals || [];

  if (typeof audit === 'string' || !audit) {
    return (
      <div className="space-y-6">
        <div className="bg-stone-900/50 border border-stone-800 rounded-2xl p-8">
          <p className="text-stone-300 leading-relaxed">
            {typeof audit === 'string' ? audit : 'Audit trail not available for this candidate.'}
          </p>
        </div>
        {levers.length > 0 && <CounterfactualPanel levers={levers} />}
      </div>
    );
  }

  const factors = audit.factor_contributions || [];

  const timeline = [
    {
      icon: Target,
      title: 'Audit Overview',
      content: audit.overview || 'General evaluation overview.',
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/20',
    },
    ...factors.map((factor: ScoreFactor) => {
      const colors = factorColor(factor.factor);
      return {
        icon: factorIcon(factor.factor),
        title: factor.factor.charAt(0).toUpperCase() + factor.factor.slice(1).replace(/_/g, ' '),
        content: factor.explanation,
        color: colors.text,
        bg: colors.track,
        border: 'border-white/5',
      };
    }),
  ];

  return (
    <div className="space-y-8">
      <CounterfactualPanel levers={levers} />
      <FactorBars factors={factors} />

      <div className="relative space-y-8 before:absolute before:inset-0 before:ml-6 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-stone-850 before:to-transparent">
        {timeline.map((item, i) => (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { delay: Math.min(i, 8) * 0.06 }}
            key={i}
            className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
          >
            <div className="flex items-center justify-center w-11 h-11 rounded-full border-4 border-stone-950 bg-stone-900 text-stone-500 group-[.is-active]:text-stone-50 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
              <div className={`w-full h-full rounded-full flex items-center justify-center ${item.bg} ${item.border} border`}>
                <item.icon className={`w-4 h-4 ${item.color}`} />
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
    </div>
  );
}
