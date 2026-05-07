import React from 'react';
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
    <div className="bg-stone-900/50 border border-stone-800 rounded-2xl p-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-display font-semibold text-stone-100 flex items-center gap-2">
          <Mail className="w-5 h-5 text-emerald-400" />
          Email Draft
        </h3>
        <span className="text-xs font-medium text-stone-500 bg-stone-800 px-3 py-1 rounded-full">Client-Side</span>
      </div>
      
      <div className="bg-stone-950 border border-stone-800 rounded-xl p-6 text-sm text-stone-300 whitespace-pre-wrap font-mono leading-relaxed shadow-inner">
        {emailContent || 'No email template available for this candidate.'}
      </div>

      <div className="mt-8 flex justify-end">
        <a
          href={mailtoLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-stone-100 hover:bg-white text-stone-950 px-8 py-3 rounded-xl font-medium transition-colors shadow-lg"
        >
          <Send className="w-4 h-4" />
          Open in Email App
        </a>
      </div>
    </div>
  );
}
