import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Candidate } from '../types';
import { XCircle, Github, ShieldCheck, FileText, Mail, User, Briefcase, GraduationCap, AlertCircle, StickyNote, Loader2 } from 'lucide-react';
import { AuditLog } from './AuditLog';
import { EmailPanel } from './EmailPanel';
import { NotesPanel } from './NotesPanel';
import { buildApiHeaders, getApiUrl } from '../api';
import { useNotifications } from './NotificationContext';

interface CandidateProfileProps {
  candidate: Candidate;
  onClose: () => void;
  onUpdateCandidate: (updatedCandidate: Candidate) => void;
}

type Tab = 'overview' | 'resume' | 'audit' | 'github' | 'email' | 'notes';

export function CandidateProfile({ candidate, onClose, onUpdateCandidate }: CandidateProfileProps) {
  const { showNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [isMoving, setIsMoving] = useState(false);
  const apiUrl = getApiUrl();

  const handleMoveToPool = async () => {
    setIsMoving(true);
    try {
      const response = await fetch(`${apiUrl}/api/candidates/${candidate.id}/decision`, {
        method: 'PUT',
        headers: buildApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ decision: 'under_consideration' })
      });
      if (!response.ok) throw new Error('Failed to update decision');
      const updatedCandidate = { ...candidate, decision: 'under_consideration' };
      onUpdateCandidate(updatedCandidate);
      showNotification('Candidate moved to Under Consideration pool!', 'success');
    } catch (e) {
      showNotification('Error moving candidate to pool.', 'error');
    } finally {
      setIsMoving(false);
    }
  };

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
        className="relative glass-panel rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-8 py-5 border-b border-stone-850 bg-stone-900/30 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-display font-bold text-stone-50 mb-1">{candidate.name}</h2>
            <div className="flex items-center gap-4 text-xs text-stone-400">
              <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-stone-500" /> {candidate.email || 'No email provided'}</span>
              {candidate.score > 0 && (
                <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                  Match Score: {candidate.score.toFixed(1)}/100
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {candidate.decision !== 'under_consideration' && candidate.decision !== 'shortlist' && (
              <button 
                onClick={handleMoveToPool}
                disabled={isMoving}
                className="bg-stone-100 hover:bg-white text-stone-950 px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 shadow-lg disabled:opacity-50"
              >
                {isMoving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Move to Pool'}
              </button>
            )}
            <button 
              onClick={onClose} 
              className="text-stone-500 hover:text-stone-300 bg-stone-900/40 hover:bg-stone-800 p-2 rounded-xl border border-stone-850/50 transition-all"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-8 border-b border-stone-850 bg-stone-900/10 overflow-x-auto hide-scrollbar">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={`relative flex items-center gap-2 px-6 py-4 text-xs font-semibold tracking-wide transition-colors whitespace-nowrap ${isActive ? 'text-emerald-400' : 'text-stone-500 hover:text-stone-300'}`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {isActive && (
                  <motion.div 
                    layoutId="activeProfileTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400"
                  />
                )}
              </button>
            );
          })}
        </div>
        
        {/* Content */}
        <div className="p-8 overflow-y-auto flex-1 bg-stone-950/20 custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === 'overview' && (
                <div className="space-y-8">
                  {candidate.error && (
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-5">
                      <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-1.5 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Validation Error
                      </h3>
                      <p className="text-rose-300 text-xs leading-relaxed">{candidate.error}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-8">
                      <section>
                        <h3 className="text-sm font-semibold text-stone-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                          <Briefcase className="w-4.5 h-4.5 text-emerald-400" />
                          Experience
                        </h3>
                        <div className="glass-panel-interactive rounded-2xl p-6 text-sm text-stone-300 whitespace-pre-wrap leading-relaxed">
                          {candidate.experience_summary || 'No experience summary available'}
                        </div>
                      </section>
                      
                      <section>
                        <h3 className="text-sm font-semibold text-stone-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                          <GraduationCap className="w-4.5 h-4.5 text-emerald-400" />
                          Education
                        </h3>
                        <div className="glass-panel-interactive rounded-2xl p-6 text-sm text-stone-300 whitespace-pre-wrap leading-relaxed">
                          {candidate.education || 'Not specified'}
                        </div>
                      </section>
                    </div>
                    
                    <div className="space-y-8">
                      <section>
                        <h3 className="text-sm font-semibold text-stone-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                          <FileText className="w-4.5 h-4.5 text-emerald-400" />
                          Suggested Interview Questions
                        </h3>
                        <ul className="space-y-4">
                          {candidate.interview_questions?.map((q, i) => (
                            <li key={i} className="flex gap-4 glass-panel-interactive rounded-2xl p-5">
                              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 font-bold text-xs shrink-0">
                                {i + 1}
                              </span>
                              <span className="text-xs md:text-sm text-stone-300 leading-relaxed pt-0.5">{q}</span>
                            </li>
                          ))}
                          {(!candidate.interview_questions || candidate.interview_questions.length === 0) && (
                            <p className="text-stone-600 text-xs">No questions suggested.</p>
                          )}
                        </ul>
                      </section>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'resume' && (
                <div className="h-full min-h-[500px] flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-stone-300 uppercase tracking-wider flex items-center gap-2">
                      <FileText className="w-4.5 h-4.5 text-emerald-400" />
                      {candidate.file_name}
                    </h3>
                    {candidate.stored_file && (
                      <a 
                        href={`${apiUrl}/api/uploads/${candidate.stored_file}`} 
                        download={candidate.file_name}
                        className="px-4 py-2 bg-stone-900 border border-stone-850 text-stone-200 text-xs font-semibold rounded-xl transition-all hover:bg-stone-850"
                      >
                        Download File
                      </a>
                    )}
                  </div>
                  
                  {candidate.stored_file ? (
                    <div className="flex-1 flex flex-col items-center justify-center glass-panel rounded-2xl p-8 text-center min-h-[400px]">
                      <FileText className="w-14 h-14 text-emerald-500/35 mb-4" />
                      <h4 className="text-base font-semibold text-stone-200 mb-1.5">Resume Document</h4>
                      <p className="text-stone-500 text-xs max-w-sm mb-6 leading-relaxed">
                        For security reasons, Chrome blocks inline document previewing in sandboxed environments. 
                        Please open or download the file to view it safely.
                      </p>
                      <div className="flex items-center gap-4">
                        <a 
                          href={`${apiUrl}/api/uploads/${candidate.stored_file}`} 
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-5 py-2.5 bg-stone-900 hover:bg-stone-850 text-stone-200 text-xs font-semibold rounded-xl transition-all border border-stone-850 shadow-md"
                        >
                          Open in New Tab
                        </a>
                        <a 
                          href={`${apiUrl}/api/uploads/${candidate.stored_file}`} 
                          download={candidate.file_name}
                          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-stone-950 text-xs font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/10"
                        >
                          Download File
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center glass-panel rounded-2xl p-8 text-center min-h-[400px]">
                      <p className="text-stone-600 text-xs">Resume file is not available for preview.</p>
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
                          transition={{ delay: i * 0.08 }}
                          key={i} 
                          className="glass-panel-interactive rounded-2xl p-6 group"
                        >
                          <h4 className="font-display font-semibold text-stone-100 group-hover:text-emerald-400 transition-colors">{repo.name}</h4>
                          <p className="text-xs text-stone-400 mt-2 mb-4 line-clamp-2 leading-relaxed">{repo.description}</p>
                          <div className="flex items-center gap-4 text-[10px] font-semibold text-stone-500">
                            {repo.language && (
                              <span className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
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
                    <div className="text-center py-12 glass-panel rounded-2xl">
                      <Github className="w-10 h-10 text-stone-700 mx-auto mb-4" />
                      <p className="text-stone-500 text-xs">No GitHub data available for this candidate.</p>
                      {candidate.github?.note && (
                        <div className="mt-6 inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-2 rounded-lg text-xs">
                          <AlertCircle className="w-3.5 h-3.5" />
                          {candidate.github.note}
                        </div>
                      )}
                    </div>
                  )}

                  {candidate.github?.fallback_url && (
                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-6 mt-8">
                      <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <Github className="w-4 h-4" />
                        GitHub Projects (Fallback)
                      </h3>
                      <p className="text-xs text-emerald-300/80 mb-4">{candidate.github.note || 'Please use the analyzer link below to view the repositories manually.'}</p>
                      <a 
                        href={candidate.github.fallback_url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 bg-emerald-500 text-stone-950 px-5 py-2.5 rounded-xl font-semibold text-xs hover:bg-emerald-450 transition-all shadow-lg shadow-emerald-500/10"
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
        <div className="px-8 py-5 border-t border-stone-850 bg-stone-900/30 flex justify-end gap-4">
          <button 
            onClick={onClose}
            className="px-5 py-2 text-stone-400 font-semibold hover:text-stone-100 hover:bg-stone-900/40 rounded-xl transition-all border border-transparent hover:border-stone-850"
          >
            Close Profile
          </button>
          <button 
            onClick={() => {
              onUpdateCandidate({ ...candidate, decision: 'shortlist' });
              onClose();
            }}
            className="px-5 py-2 bg-emerald-500 text-stone-950 font-bold hover:bg-emerald-400 rounded-xl transition-all shadow-lg shadow-emerald-500/10 text-xs"
          >
            Shortlist Candidate
          </button>
        </div>
      </motion.div>
    </div>
  );
}
