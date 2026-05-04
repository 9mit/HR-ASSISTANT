import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Candidate } from '../types';
import { XCircle, Github, ShieldCheck, FileText, Mail, User, Briefcase, GraduationCap, AlertCircle, StickyNote } from 'lucide-react';
import { AuditLog } from './AuditLog';
import { EmailPanel } from './EmailPanel';
import { NotesPanel } from './NotesPanel';

interface CandidateProfileProps {
  candidate: Candidate;
  onClose: () => void;
  onUpdateCandidate: (updatedCandidate: Candidate) => void;
}

type Tab = 'overview' | 'resume' | 'audit' | 'github' | 'email' | 'notes';

export function CandidateProfile({ candidate, onClose, onUpdateCandidate }: CandidateProfileProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const apiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

  const tabs = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'resume', label: 'Original Resume', icon: FileText },
    { id: 'audit', label: 'Fairness Audit', icon: ShieldCheck },
    { id: 'github', label: 'GitHub Projects', icon: Github },
    { id: 'email', label: 'Automated Email', icon: Mail },
    { id: 'notes', label: 'Notes', icon: StickyNote },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm"
      />
      
      <motion.div 
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative bg-stone-950 border border-stone-800 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-8 py-6 border-b border-stone-800 bg-stone-900/50 flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-display font-bold text-stone-50 mb-2">{candidate.name}</h2>
            <div className="flex items-center gap-4 text-sm text-stone-400">
              <span className="flex items-center gap-1"><Mail className="w-4 h-4" /> {candidate.email || 'No email provided'}</span>
              {candidate.score > 0 && (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  Match Score: {candidate.score}/100
                </span>
              )}
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-stone-500 hover:text-stone-300 bg-stone-800/50 hover:bg-stone-800 p-2 rounded-full transition-all"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-8 border-b border-stone-800 bg-stone-900/30 overflow-x-auto hide-scrollbar">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={`relative flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${isActive ? 'text-emerald-400' : 'text-stone-500 hover:text-stone-300'}`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {isActive && (
                  <motion.div 
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500"
                  />
                )}
              </button>
            );
          })}
        </div>
        
        {/* Content */}
        <div className="p-8 overflow-y-auto flex-1 bg-stone-950 custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'overview' && (
                <div className="space-y-8">
                  {candidate.error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6">
                      <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Validation Error
                      </h3>
                      <p className="text-red-300 text-sm leading-relaxed">{candidate.error}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-8">
                      <section>
                        <h3 className="text-lg font-display font-semibold text-stone-100 mb-4 flex items-center gap-2">
                          <Briefcase className="w-5 h-5 text-emerald-400" />
                          Experience
                        </h3>
                        <div className="bg-stone-900/50 border border-stone-800 rounded-2xl p-6 text-sm text-stone-300 whitespace-pre-wrap leading-relaxed">
                          {candidate.experience_summary || 'No experience summary available'}
                        </div>
                      </section>
                      
                      <section>
                        <h3 className="text-lg font-display font-semibold text-stone-100 mb-4 flex items-center gap-2">
                          <GraduationCap className="w-5 h-5 text-emerald-400" />
                          Education
                        </h3>
                        <div className="bg-stone-900/50 border border-stone-800 rounded-2xl p-6 text-sm text-stone-300 whitespace-pre-wrap leading-relaxed">
                          {candidate.education || 'Not specified'}
                        </div>
                      </section>
                    </div>
                    
                    <div className="space-y-8">
                      <section>
                        <h3 className="text-lg font-display font-semibold text-stone-100 mb-4 flex items-center gap-2">
                          <FileText className="w-5 h-5 text-emerald-400" />
                          Suggested Interview Questions
                        </h3>
                        <ul className="space-y-4">
                          {candidate.interview_questions?.map((q, i) => (
                            <li key={i} className="flex gap-4 bg-stone-900/50 border border-stone-800 rounded-2xl p-5">
                              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 font-bold text-sm shrink-0">
                                {i + 1}
                              </span>
                              <span className="text-sm text-stone-300 leading-relaxed pt-1">{q}</span>
                            </li>
                          ))}
                          {(!candidate.interview_questions || candidate.interview_questions.length === 0) && (
                            <p className="text-stone-500 text-sm">No questions suggested.</p>
                          )}
                        </ul>
                      </section>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'resume' && (
                <div className="h-full min-h-[600px] flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-display font-semibold text-stone-100 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-emerald-400" />
                      {candidate.file_name}
                    </h3>
                    {candidate.stored_file && (
                      <a 
                        href={`${apiUrl}/uploads/${candidate.stored_file}`} 
                        download={candidate.file_name}
                        className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-100 text-sm font-medium rounded-xl transition-colors"
                      >
                        Download File
                      </a>
                    )}
                  </div>
                  
                  {candidate.stored_file ? (
                    candidate.file_name.toLowerCase().endsWith('.docx') ? (
                      <div className="flex-1 flex flex-col items-center justify-center bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 text-center">
                        <FileText className="w-16 h-16 text-zinc-600 mb-4" />
                        <h4 className="text-lg font-medium text-zinc-300 mb-2">DOCX Preview Not Supported</h4>
                        <p className="text-zinc-500 text-sm max-w-md mb-6">
                          Browsers do not natively support previewing Word documents. Please download the file to view it.
                        </p>
                        <a 
                          href={`${apiUrl}/uploads/${candidate.stored_file}`} 
                          download={candidate.file_name}
                          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-emerald-500/20"
                        >
                          Download {candidate.file_name}
                        </a>
                      </div>
                    ) : (
                      <div className="flex-1 bg-stone-100 rounded-2xl overflow-hidden border border-stone-800">
                        <iframe 
                          src={`${apiUrl}/uploads/${candidate.stored_file}`} 
                          className="w-full h-full min-h-[600px] border-0"
                          title="Resume Preview"
                        />
                      </div>
                    )
                  ) : (
                    <div className="flex-1 flex items-center justify-center bg-stone-900/50 border border-stone-800 rounded-2xl p-8 text-center">
                      <p className="text-stone-500">Resume file is not available for preview.</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'audit' && (
                <AuditLog audit={candidate.audit} />
              )}

              {activeTab === 'github' && (
                <div className="space-y-6">
                  {candidate.github?.repos ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {candidate.github.repos.map((repo: any, i: number) => (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.1 }}
                          key={i} 
                          className="bg-stone-900/50 border border-stone-800 rounded-2xl p-6 hover:border-stone-700 transition-colors group"
                        >
                          <h4 className="font-display font-semibold text-stone-100 group-hover:text-emerald-400 transition-colors">{repo.name}</h4>
                          <p className="text-sm text-stone-400 mt-2 mb-4 line-clamp-2 leading-relaxed">{repo.description}</p>
                          <div className="flex items-center gap-4 text-xs font-medium text-stone-500">
                            {repo.language && (
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                {repo.language}
                              </span>
                            )}
                            {repo.stars && (
                              <span className="flex items-center gap-1">
                                ⭐ {repo.stars}
                              </span>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-stone-900/30 border border-stone-800/50 rounded-2xl">
                      <Github className="w-12 h-12 text-stone-700 mx-auto mb-4" />
                      <p className="text-stone-400">No GitHub data available for this candidate.</p>
                      {candidate.github?.note && (
                        <div className="mt-6 inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-2 rounded-lg text-sm">
                          <AlertCircle className="w-4 h-4" />
                          {candidate.github.note}
                        </div>
                      )}
                    </div>
                  )}

                  {candidate.github?.fallback_url && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 mt-8">
                      <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <Github className="w-4 h-4" />
                        GitHub Projects (Fallback)
                      </h3>
                      <p className="text-sm text-emerald-300/80 mb-4">{candidate.github.note || 'Please use the analyzer link below to view the repositories manually.'}</p>
                      <a 
                        href={candidate.github.fallback_url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-medium text-sm hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20"
                      >
                        Open GitHub Repo Analyser
                      </a>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'email' && (
                <EmailPanel 
                  emailContent={candidate.communication?.body || ''} 
                  candidateName={candidate.name || candidate.alias} 
                  candidateEmail={candidate.email || ''}
                  candidateId={candidate.id}
                />
              )}

              {activeTab === 'notes' && (
                <NotesPanel
                  candidateId={candidate.id}
                  initialNotes={candidate.notes}
                  onUpdateNotes={(notes) => onUpdateCandidate({ ...candidate, notes })}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        
        {/* Footer */}
        <div className="px-8 py-6 border-t border-stone-800 bg-stone-900/50 flex justify-end gap-4">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 text-stone-400 font-medium hover:text-stone-100 hover:bg-stone-800 rounded-xl transition-all"
          >
            Close Profile
          </button>
          <button 
            onClick={() => {
              onUpdateCandidate({ ...candidate, decision: 'shortlist' });
              onClose();
            }}
            className="px-6 py-2.5 bg-emerald-500 text-stone-950 font-medium hover:bg-emerald-400 rounded-xl transition-all shadow-lg shadow-emerald-500/10"
          >
            Shortlist Candidate
          </button>
        </div>
      </motion.div>
    </div>
  );
}
