import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Database, ScanSearch, Scale, ShieldCheck, Sparkles, Settings, Activity, AlertCircle, CheckCircle2, XCircle, Cpu, Loader2, Key, Eye, EyeOff, Mail, Download } from 'lucide-react';
import { BatchSummary, Candidate, EphemeralKeys, LocalModelOption, ProcessResponse } from './types';
import { UploadPanel } from './components/UploadPanel';
import { CandidateTable } from './components/CandidateTable';
import { CandidateProfile } from './components/CandidateProfile';

import { PoolPanel } from './components/PoolPanel';
import { RejectedPanel } from './components/RejectedPanel';
import { buildApiHeaders, getApiUrl } from './api';
import { useNotifications } from './components/NotificationContext';

const summaryCards = (summary: BatchSummary | null) => {
  if (!summary) return [];

  return [
    { label: 'Processed', value: summary.processed_candidates },
    { label: 'Ranked', value: summary.ranked_candidates },
    { label: 'Salary Gate', value: summary.excluded_by_salary },
    { label: 'Merged Duplicates', value: summary.duplicates_merged },
  ];
};

/** Serialize ephemeral keys into the X-Ephemeral-Keys header format. */
function serializeKeys(keys: EphemeralKeys): string | null {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(keys)) {
    if (v && v.trim()) parts.push(`${k}=${v.trim()}`);
  }
  return parts.length ? parts.join(',') : null;
}

export default function App() {
  const { showNotification } = useNotifications();
  const [role, setRole] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<LocalModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'batch' | 'pool' | 'rejected'>('batch');

  // Ephemeral API keys — stored in memory only, never persisted
  const [ephemeralKeys, setEphemeralKeys] = useState<EphemeralKeys>({});
  const [keyVisibility, setKeyVisibility] = useState<Record<string, boolean>>({});

  // HR Identity — for email automation
  const [hrEmail, setHrEmail] = useState('');
  const [hrName, setHrName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [autoSendEmails, setAutoSendEmails] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const apiUrl = getApiUrl();

  const ephemeralHeader = serializeKeys(ephemeralKeys);

  useEffect(() => {
    const loadModels = async () => {
      setIsLoadingModels(true);
      setModelError(null);

      try {
        const headers = buildApiHeaders(
          ephemeralHeader ? { 'X-Ephemeral-Keys': ephemeralHeader } : undefined
        );

        const response = await fetch(`${apiUrl}/api/local-models`, { headers });
        if (!response.ok) {
          throw new Error('Unable to load local models');
        }

        const data = await response.json();
        setAvailableModels(data.models || []);
        setSelectedModelId(data.default_model_id || data.models?.[0]?.id || '');
      } catch {
        setModelError('Local model discovery is unavailable, so TalentLens will use its built-in parser.');
        setAvailableModels([
          {
            id: 'builtin:heuristic',
            provider: 'builtin',
            label: 'TalentLens deterministic parser',
            model_name: 'heuristic',
            availability: 'available',
            status: 'ready',
            supports_structured_output: true,
          },
        ]);
        setSelectedModelId('builtin:heuristic');
      } finally {
        setIsLoadingModels(false);
      }
    };

    void loadModels();
  }, [apiUrl, ephemeralHeader]);



  useEffect(() => {
    if (!isSettingsOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSettingsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSettingsOpen]);

  const removeFile = (index: number) => {
    setFiles((current) => current.filter((_, i) => i !== index));
  };

  const processResumes = async () => {
    if (!role || files.length === 0 || !salaryMin || !salaryMax) {
      showNotification('Enter a role, salary range, and at least one resume.', 'error');
      return;
    }

    if (autoSendEmails && !hrEmail) {
      showNotification('Please enter your email address to enable automatic candidate notifications.', 'error');
      return;
    }

    setIsProcessing(true);
    setError(null);
    const formData = new FormData();
    formData.append('role', role);
    formData.append('salary_min', salaryMin);
    formData.append('salary_max', salaryMax);
    formData.append('selected_model_id', selectedModelId || 'builtin:heuristic');
    formData.append('auto_send_emails', autoSendEmails ? 'true' : 'false');
    if (hrEmail) formData.append('hr_email', hrEmail);
    if (hrName) formData.append('hr_name', hrName);
    if (companyName) formData.append('company_name', companyName);
    files.forEach((file) => formData.append('resumes', file));
    
    try {
      const headers = buildApiHeaders(
        ephemeralHeader ? { 'X-Ephemeral-Keys': ephemeralHeader } : undefined
      );

      const response = await fetch(`${apiUrl}/api/process-resumes`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error occurred' }));
        throw new Error(errorData.detail || 'Processing failed');
      }

      const data: ProcessResponse = await response.json();
      setSummary(data.summary);
      setCandidates(data.candidates);
      setBatchId(data.batch_id);
    } catch (caughtError: any) {
      setError(caughtError.message || 'The local TalentLens API is unavailable. Start FastAPI on port 8000 and try again.');
    } finally {
      setIsProcessing(false);
    }
  };
  const exportBatchCsv = async () => {
    if (!batchId) return;
    setIsExporting(true);
    try {
      const response = await fetch(`${apiUrl}/api/export-candidates/${batchId}`, {
        headers: buildApiHeaders(),
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `TalentLens_batch_${batchId}.csv`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message || 'CSV export failed');
    } finally {
      setIsExporting(false);
    }
  };



  const activeModel = availableModels.find(m => m.id === selectedModelId) || availableModels[0];

  const keyFields = [
    { key: 'OPENAI_API_KEY' as const, label: 'OpenAI', placeholder: 'sk-...' },
    { key: 'ANTHROPIC_API_KEY' as const, label: 'Anthropic', placeholder: 'sk-ant-...' },
    { key: 'GEMINI_API_KEY' as const, label: 'Gemini', placeholder: 'AI...' },
    { key: 'GROQ_API_KEY' as const, label: 'Groq', placeholder: 'gsk_...' },
  ];

  return (
    <div className="min-h-screen font-sans text-stone-100 selection:bg-emerald-500/30">
      <header className="sticky top-0 z-20 border-b border-stone-850/60 bg-stone-950/75 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/5 shadow-[0_0_30px_rgba(16,185,129,0.15)]">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="font-display text-xl font-semibold tracking-tight text-stone-50">TalentLens</p>
              <p className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Local Candidate Intelligence</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-4 md:flex">
              <div className="flex items-center gap-2 rounded-full border border-stone-850 bg-stone-900/40 px-4 py-1.5 text-xs">
                <div className={`h-1.5 w-1.5 rounded-full ${activeModel?.status === 'ready' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span className="text-stone-500">Active Engine:</span>
                <span className="font-medium text-stone-300">{activeModel?.label || 'Loading...'}</span>
              </div>
            </div>
            <button 
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              aria-label="Open settings"
              className="group flex h-9 w-9 items-center justify-center rounded-xl border border-stone-850 bg-stone-900/40 transition-all hover:bg-emerald-500/10 hover:border-emerald-500/30"
            >
              <Settings className="h-4 w-4 text-stone-400 transition-colors group-hover:text-emerald-400" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <section className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="glass-panel rounded-[2rem] p-8 shadow-xl shadow-black/40">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-stone-800 bg-stone-900/60 px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] text-stone-400">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              Production-grade local workflow
            </div>

            <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight text-stone-50 md:text-5xl">
              Rank candidates on <span className="gradient-text">capability</span>, not identity.
            </h1>
            <p className="mt-5 max-w-2xl text-sm md:text-base leading-relaxed text-stone-400">
              TalentLens parses resumes in bulk, redacts PII before ranking, scores with auditable factors,
              merges duplicates, and drafts a response for every candidate — completely free, no paid APIs required.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="glass-panel-interactive rounded-2xl p-4">
                <Database className="mb-3 h-5 w-5 text-emerald-400" />
                <p className="text-sm font-medium text-stone-200">SQLite audit trail</p>
                <p className="mt-1 text-xs text-stone-500 leading-normal">Every score, note, and email action is reproducible.</p>
              </div>
              <div className="glass-panel-interactive rounded-2xl p-4">
                <ScanSearch className="mb-3 h-5 w-5 text-cyan-400" />
                <p className="text-sm font-medium text-stone-200">Semantic matching</p>
                <p className="mt-1 text-xs text-stone-500 leading-normal">TF-IDF + cosine similarity for deterministic ranking.</p>
              </div>
              <div className="glass-panel-interactive rounded-2xl p-4">
                <Scale className="mb-3 h-5 w-5 text-amber-400" />
                <p className="text-sm font-medium text-stone-200">Explainable scoring</p>
                <p className="mt-1 text-xs text-stone-500 leading-normal">Weighted factors plus audit logs for every decision.</p>
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-[2rem] p-6 shadow-xl">
            <p className="text-[10px] uppercase tracking-[0.25em] text-stone-500 font-medium">Fairness guardrails</p>
            <ul className="mt-5 space-y-4 text-xs md:text-sm text-stone-300">
              <li className="glass-panel-interactive rounded-xl p-4">
                Ranking inputs exclude name, gender markers, phone, address, and other direct identifiers.
              </li>
              <li className="glass-panel-interactive rounded-xl p-4">
                Salary is a pre-score gate. Out-of-range or missing expectations are held before weighting.
              </li>
              <li className="glass-panel-interactive rounded-xl p-4">
                Candidates without GitHub get a neutral project score (50) — no bias.
              </li>
              <li className="glass-panel-interactive rounded-xl p-4">
                Communication drafts are generated locally so no candidate gets ghosted.
              </li>
            </ul>
          </div>
        </section>

        <div className="flex gap-6 border-b border-stone-850" role="tablist" aria-label="Main workspace">
          <button 
            type="button"
            role="tab"
            aria-selected={activeTab === 'batch'}
            onClick={() => setActiveTab('batch')}
            className={`relative pb-4 text-sm font-medium transition-all ${activeTab === 'batch' ? 'text-emerald-400 font-semibold' : 'text-stone-500 hover:text-stone-300'}`}
          >
            Upload & Active Batch
            {activeTab === 'batch' && (
              <motion.div layoutId="activeMainTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400" />
            )}
          </button>
          <button 
            type="button"
            role="tab"
            aria-selected={activeTab === 'pool'}
            onClick={() => setActiveTab('pool')}
            className={`relative pb-4 text-sm font-medium transition-all ${activeTab === 'pool' ? 'text-emerald-400 font-semibold' : 'text-stone-500 hover:text-stone-300'}`}
          >
            Under Consideration Pool
            {activeTab === 'pool' && (
              <motion.div layoutId="activeMainTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400" />
            )}
          </button>
          <button 
            type="button"
            role="tab"
            aria-selected={activeTab === 'rejected'}
            onClick={() => setActiveTab('rejected')}
            className={`relative pb-4 text-sm font-medium transition-all ${activeTab === 'rejected' ? 'text-emerald-400 font-semibold' : 'text-stone-500 hover:text-stone-300'}`}
          >
            Rejected Candidates
            {activeTab === 'rejected' && (
              <motion.div layoutId="activeMainTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400" />
            )}
          </button>
        </div>

        {activeTab === 'batch' && (
          <div className="flex flex-col gap-10">
            <UploadPanel 
              role={role}
              setRole={setRole}
              salaryMin={salaryMin}
              setSalaryMin={setSalaryMin}
              salaryMax={salaryMax}
              setSalaryMax={setSalaryMax}
              files={files}
              setFiles={setFiles}
              availableModels={availableModels}
              selectedModelId={selectedModelId}
              setSelectedModelId={setSelectedModelId}
              isLoadingModels={isLoadingModels}
              modelError={modelError}
              isProcessing={isProcessing}
              processResumes={processResumes}
              removeFile={removeFile}
              hrEmail={hrEmail}
              setHrEmail={setHrEmail}
              hrName={hrName}
              setHrName={setHrName}
              companyName={companyName}
              setCompanyName={setCompanyName}
              autoSendEmails={autoSendEmails}
              setAutoSendEmails={setAutoSendEmails}
            />

            {error && (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-200">
                {error}
              </div>
            )}

            {summary && (
              <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="grid gap-4 sm:grid-cols-2">
                  {summaryCards(summary).map((card) => (
                    <div
                      key={card.label}
                      className="glass-panel-interactive rounded-2xl p-5 shadow-lg"
                    >
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">{card.label}</p>
                      <p className="mt-2 font-display text-4xl font-semibold gradient-text">{card.value}</p>
                    </div>
                  ))}
                </div>

                <div className="glass-panel rounded-2xl p-6 shadow-lg">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">Batch summary</p>
                      <h2 className="mt-1 font-display text-xl font-semibold text-stone-50">{summary.role}</h2>
                      <p className="mt-1 text-xs text-stone-500">Processed with {summary.selected_model_label || summary.model_backend}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {batchId && (
                        <button
                          type="button"
                          onClick={() => void exportBatchCsv()}
                          disabled={isExporting}
                          className="flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-2 text-xs font-semibold text-cyan-300 transition-all hover:bg-cyan-500/10 hover:border-cyan-500/30 disabled:opacity-50"
                        >
                          <Download className="h-3.5 w-3.5" />
                          {isExporting ? 'Exporting…' : 'Export CSV'}
                        </button>
                      )}
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2 text-xs font-semibold text-emerald-400">
                        {summary.salary_range.minimum.toLocaleString()} - {summary.salary_range.maximum.toLocaleString()} {summary.salary_range.currency}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 space-y-2">
                    {summary.fairness_highlights.map((highlight, index) => (
                      <div key={index} className="rounded-xl border border-stone-850/60 bg-stone-900/30 px-4 py-2.5 text-xs text-stone-400">
                        {highlight}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {candidates.length > 0 && (
              <CandidateTable 
                candidates={candidates}
                onSelect={setSelectedCandidate}
              />
            )}
          </div>
        )}

        {activeTab === 'pool' && (
          <PoolPanel onSelectCandidate={setSelectedCandidate} />
        )}

        {activeTab === 'rejected' && (
          <RejectedPanel onSelectCandidate={setSelectedCandidate} />
        )}
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-stone-950/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
              className="relative w-full max-w-2xl overflow-y-auto max-h-[90vh] rounded-[2.5rem] border border-stone-800 bg-stone-950 p-8 shadow-[0_40px_100px_rgba(0,0,0,0.6)]"
            >
              <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <Activity className="h-5 w-5 text-emerald-300" />
                  </div>
                  <div>
                    <h2 id="settings-title" className="font-display text-xl font-semibold text-stone-50">System Intelligence</h2>
                    <p className="text-sm text-stone-500">Configure AI runtimes and manage API keys.</p>
                  </div>
                </div>
                <button type="button" onClick={() => setIsSettingsOpen(false)} aria-label="Close settings" className="text-stone-500 hover:text-stone-300">
                  <XCircle className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-6">


                {/* API Keys — Ephemeral, masked, never stored */}
                <div>
                  <h3 className="mb-2 text-xs uppercase tracking-[0.2em] text-stone-500 flex items-center gap-2">
                    <Key className="h-3.5 w-3.5" />
                    API Keys (Optional — Session Only)
                  </h3>
                  <p className="mb-4 text-xs text-stone-500 leading-relaxed">
                    Keys are held in browser memory only for this session. They are <strong className="text-stone-300">never stored, logged, or persisted</strong> by the backend. Close this tab and they're gone.
                  </p>
                  <div className="space-y-3">
                    {keyFields.map(({ key, label, placeholder }) => (
                      <div key={key} className="flex items-center gap-3">
                        <label className="w-24 text-xs font-medium text-stone-400 shrink-0">{label}</label>
                        <div className="relative flex-1">
                          <input
                            type={keyVisibility[key] ? 'text' : 'password'}
                            value={ephemeralKeys[key] || ''}
                            onChange={(e) => setEphemeralKeys(prev => ({ ...prev, [key]: e.target.value }))}
                            placeholder={placeholder}
                            autoComplete="off"
                            className="w-full rounded-xl border border-stone-800 bg-stone-900/80 py-2.5 pl-4 pr-10 text-sm text-stone-100 outline-none transition-all placeholder:text-stone-600 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/20 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setKeyVisibility(prev => ({ ...prev, [key]: !prev[key] }))}
                            aria-label={keyVisibility[key] ? `Hide ${label} API key` : `Show ${label} API key`}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 transition-colors"
                          >
                            {keyVisibility[key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {ephemeralKeys[key] && (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Provider Status */}
                <div>
                  <h3 className="mb-4 text-xs uppercase tracking-[0.2em] text-stone-500">Provider Status</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {availableModels.map((model) => (
                      <div key={model.id} className="flex items-center justify-between rounded-2xl border border-stone-900 bg-stone-900/40 p-4">
                        <div className="flex items-center gap-3">
                          <Cpu className="h-4 w-4 text-stone-500" />
                          <div className="text-sm">
                            <p className="font-medium text-stone-200">{model.label}</p>
                            <p className="text-xs text-stone-500">{model.provider}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {model.status === 'ready' ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-amber-400" />
                          )}
                          <span className={`text-[10px] uppercase font-bold tracking-wider ${model.status === 'ready' ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {model.status === 'ready' ? 'Active' : 'Missing Key'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-500/10 bg-emerald-500/5 p-5">
                  <h3 className="flex items-center gap-2 text-sm font-medium text-stone-200">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Automatic Fallback Enabled
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-stone-400">
                    If a selected cloud provider is unavailable, TalentLens will automatically fall back to the free Deterministic Engine. No data leaves your machine.
                  </p>
                </div>


              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Candidate Modal */}
      <AnimatePresence>
        {selectedCandidate && (
          <CandidateProfile 
            candidate={selectedCandidate}
            onClose={() => setSelectedCandidate(null)}
            onUpdateCandidate={(updatedCandidate) => {
              setSelectedCandidate(updatedCandidate);
              setCandidates((current) => current.map((candidate) => (candidate.id === updatedCandidate.id ? updatedCandidate : candidate)));
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
