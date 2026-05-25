import React from 'react';
import { motion } from 'motion/react';
import { Mail, Send } from 'lucide-react';

interface EmailPanelProps {
  emailContent: string;
  candidateName: string;
  candidateEmail: string;
  candidateId: string;
}

export function EmailPanel({ emailContent, candidateEmail }: EmailPanelProps) {
  const subject = encodeURIComponent(`Update on your application`);
  const body = encodeURIComponent(emailContent || '');
  const mailtoLink = `mailto:${candidateEmail || ''}?subject=${subject}&body=${body}`;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="glass-panel rounded-2xl p-8 h-full flex flex-col justify-between"
    >
      <div>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-display font-semibold text-stone-100 flex items-center gap-2">
            <Mail className="w-5 h-5 text-emerald-400 text-glow-emerald" />
            Email Draft
          </h3>
          <span className="text-[10px] font-bold tracking-wider text-stone-500 bg-stone-900/50 border border-stone-850 px-3 py-1 rounded-full uppercase">Client-Side</span>
        </div>
        
        <div className="bg-stone-950/60 border border-stone-850 rounded-xl p-6 text-sm text-stone-300 whitespace-pre-wrap font-mono leading-relaxed shadow-inner max-h-[350px] overflow-y-auto custom-scrollbar">
          {emailContent || 'No email template available for this candidate.'}
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <motion.a
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          href={mailtoLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-stone-950 px-8 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)]"
        >
          <Send className="w-4 h-4 text-stone-950" />
          Open in Email App
        </motion.a>
      </div>
    </motion.div>
  );
}
