import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Database, ScanSearch, Scale, ShieldCheck, Sparkles, Settings, Activity, AlertCircle, CheckCircle2, XCircle, Cpu, Loader2, Key, Eye, EyeOff, Mail, Download } from 'lucide-react';
import { BatchSummary, Candidate, EphemeralKeys, EmailStatus, LocalModelOption, ProcessResponse } from './types';
import { UploadPanel } from './components/UploadPanel';
import { CandidateTable } from './components/CandidateTable';
import { CandidateProfile } from './components/CandidateProfile';

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
  const [isValidatingMock, setIsValidatingMock] = useState(false);

  // Ephemeral API keys — stored in memory only, never persisted
  const [ephemeralKeys, setEphemeralKeys] = useState<EphemeralKeys>({});
  const [keyVisibility, setKeyVisibility] = useState<Record<string, boolean>>({});
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);

  // HR Identity — for email automation
  const [hrEmail, setHrEmail] = useState('');
  const [hrName, setHrName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [autoSendEmails, setAutoSendEmails] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

  const ephemeralHeader = serializeKeys(ephemeralKeys);

  useEffect(() => {
    const loadModels = async () => {
      setIsLoadingModels(true);
      setModelError(null);

      try {
        const headers: Record<string, string> = {};
        if (ephemeralHeader) headers['X-Ephemeral-Keys'] = ephemeralHeader;

        const response = await fetch(`${apiUrl}/api/local-models`, { headers });
        if (!response.ok) {
          throw new Error('Unable to load local models');
        }

        const data = await response.json();
        setAvailableModels(data.models || []);
        setSelectedModelId(data.default_model_id || data.models?.[0]?.id || '');
      } catch (caughtError: any) {
        console.error(caughtError);
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

  // Load email provider status
  useEffect(() => {
    const loadEmailStatus = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/email-status`);
        if (response.ok) {
          setEmailStatus(await response.json());
        }
      } catch {
        // Backend may not be running
      }
    };
    void loadEmailStatus();
  }, [apiUrl]);

  const removeFile = (index: number) => {
    setFiles((current) => current.filter((_, i) => i !== index));
  };

  const processResumes = async () => {
    if (!role || files.length === 0 || !salaryMin || !salaryMax) {
      alert('Enter a role, salary range, and at least one resume.');
      return;
    }

    if (autoSendEmails && !hrEmail) {
      alert('Please enter your email address to enable automatic candidate notifications.');
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
      const headers: Record<string, string> = {};
      if (ephemeralHeader) headers['X-Ephemeral-Keys'] = ephemeralHeader;

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
      console.error(caughtError);
      setError(caughtError.message || 'The local TalentLens API is unavailable. Start FastAPI on port 8000 and try again.');
    } finally {
      setIsProcessing(false);
    }
  };
  const validateMockResumes = async () => {
    setIsValidatingMock(true);
    setError(null);
    setCandidates([]);
    setSummary(null);

    const formData = new FormData();
    formData.append('selected_model_id', selectedModelId || 'builtin:heuristic');

    try {
      const headers: Record<string, string> = {};
      if (ephemeralHeader) headers['X-Ephemeral-Keys'] = ephemeralHeader;

      const response = await fetch(`${apiUrl}/api/validate-mock`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Mock validation failed');
      }

      const data: ProcessResponse = await response.json();
      setSummary(data.summary);
      setCandidates(data.candidates);
      setRole(data.summary.role);
      setSalaryMin(data.summary.salary_range.minimum.toString());
      setSalaryMax(data.summary.salary_range.maximum.toString());
    } catch (caughtError: any) {
      console.error(caughtError);
      setError(caughtError.message || 'Failed to run mock validation.');
    } finally {
      setIsValidatingMock(false);
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),_transparent_34%),linear-gradient(180deg,#111412_0%,#0b0d0c_52%,#060706_100%)] font-sans text-stone-100 selection:bg-emerald-500/30">
      <header className="sticky top-0 z-20 border-b border-stone-800/80 bg-stone-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/10 shadow-[0_0_40px_rgba(16,185,129,0.18)]">
              <ShieldCheck className="h-6 w-6 text-emerald-300" />
            </div>
            <div>
              <p className="font-display text-2xl font-semibold tracking-tight text-stone-50">TalentLens</p>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Local Candidate Intelligence</p>
            </div>
          </div>
          <div className="hidden items-center gap-4 md:flex">
            <div className="flex items-center gap-2 rounded-full border border-stone-800 bg-stone-900/50 px-4 py-2 text-sm">
              <div className={`h-2 w-2 rounded-full ${activeModel?.status === 'ready' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span className="text-stone-400">Active Engine:</span>
              <span className="font-medium text-stone-200">{activeModel?.label || 'Loading...'}</span>
            </div>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="group flex h-10 w-10 items-center justify-center rounded-full border border-stone-800 bg-stone-900/50 transition-all hover:bg-emerald-500/10 hover:border-emerald-500/30"
            >
              <Settings className="h-5 w-5 text-stone-400 transition-colors group-hover:text-emerald-300" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <section className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-[2rem] border border-stone-800/70 bg-stone-950/80 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-stone-700 bg-stone-900/80 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-stone-400">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              Production-grade local workflow
            </div>

            <h1 className="max-w-3xl font-display text-5xl font-semibold leading-tight text-stone-50">
              Rank candidates on capability, not identity.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-400">
              TalentLens parses resumes in bulk, redacts PII before ranking, scores with auditable factors,
              merges duplicates, and drafts a response for every candidate — completely free, no paid APIs required.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
                <Database className="mb-3 h-5 w-5 text-emerald-300" />
                <p className="text-sm font-medium text-stone-200">SQLite audit trail</p>
                <p className="mt-1 text-sm text-stone-500">Every score, note, and email action is reproducible.</p>
              </div>
              <div className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
                <ScanSearch className="mb-3 h-5 w-5 text-cyan-300" />
                <p className="text-sm font-medium text-stone-200">Semantic matching</p>
                <p className="mt-1 text-sm text-stone-500">TF-IDF + cosine similarity for deterministic ranking.</p>
              </div>
              <div className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
                <Scale className="mb-3 h-5 w-5 text-amber-300" />
                <p className="text-sm font-medium text-stone-200">Explainable scoring</p>
                <p className="mt-1 text-sm text-stone-500">Weighted factors plus audit logs for every decision.</p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-stone-800/70 bg-stone-950/80 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Fairness guardrails</p>
            <ul className="mt-5 space-y-4 text-sm leading-7 text-stone-300">
              <li className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
                Ranking inputs exclude name, gender markers, phone, address, and other direct identifiers.
              </li>
              <li className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
                Salary is a pre-score gate. Out-of-range or missing expectations are held before weighting.
              </li>
              <li className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
                Candidates without GitHub get a neutral project score (50) — no bias.
              </li>
              <li className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
                Communication drafts are generated locally so no candidate gets ghosted.
              </li>
            </ul>
          </div>
        </section>

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
                  className="rounded-2xl border border-stone-800 bg-stone-950/80 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.2)]"
                >
                  <p className="text-sm uppercase tracking-[0.18em] text-stone-500">{card.label}</p>
                  <p className="mt-2 font-display text-4xl font-semibold text-stone-50">{card.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-stone-800 bg-stone-950/80 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Batch summary</p>
                  <h2 className="mt-2 font-display text-2xl font-semibold text-stone-50">{summary.role}</h2>
                  <p className="mt-2 text-sm text-stone-500">Processed with {summary.selected_model_label || summary.model_backend}</p>
                </div>
                <div className="flex items-center gap-3">
                  {batchId && (
                    <a
                      href={`${apiUrl}/api/export-candidates/${batchId}`}
                      download
                      className="flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 transition-all hover:bg-cyan-500/20 hover:border-cyan-400/40"
                    >
                      <Download className="h-4 w-4" />
                      Export CSV
                    </a>
                  )}
                  <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300">
                    {summary.salary_range.minimum.toLocaleString()} - {summary.salary_range.maximum.toLocaleString()} {summary.salary_range.currency}
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {summary.fairness_highlights.map((highlight, index) => (
                  <div key={index} className="rounded-2xl border border-stone-800 bg-stone-900/70 px-4 py-3 text-sm text-stone-300">
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
              className="relative w-full max-w-2xl overflow-y-auto max-h-[90vh] rounded-[2.5rem] border border-stone-800 bg-stone-950 p-8 shadow-[0_40px_100px_rgba(0,0,0,0.6)]"
            >
              <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <Activity className="h-5 w-5 text-emerald-300" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-semibold text-stone-50">System Intelligence</h2>
                    <p className="text-sm text-stone-500">Configure AI runtimes and manage API keys.</p>
                  </div>
                </div>
                <button onClick={() => setIsSettingsOpen(false)} className="text-stone-500 hover:text-stone-300">
                  <XCircle className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Email Automation Status */}
                <div className={`rounded-2xl border p-5 ${emailStatus?.configured ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
                  <h3 className="flex items-center gap-2 text-sm font-medium text-stone-200">
                    <Mail className={`h-4 w-4 ${emailStatus?.configured ? 'text-emerald-400' : 'text-amber-400'}`} />
                    Email Automation: {emailStatus?.configured ? 'Active' : 'Not Configured'}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-stone-400">
                    {emailStatus?.note || 'Checking automation status...'}
                  </p>
                  {emailStatus?.configured && emailStatus.provider === 'smtp' && (
                    <p className="mt-1 text-xs text-stone-500">
                      SMTP Server: {emailStatus.server}:{emailStatus.port} | From: {emailStatus.from_email}
                    </p>
                  )}
                  {emailStatus?.configured && emailStatus.provider === 'resend' && (
                    <p className="mt-1 text-xs text-stone-500">
                      Using SaaS Mode (Resend) | Verified Domain Active
                    </p>
                  )}
                </div>

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

                <div className="flex items-center justify-between pt-4 border-t border-stone-900">
                  <div>
                    <p className="text-sm font-medium text-stone-200">Mock Data Validation</p>
                    <p className="text-xs text-stone-500">Verify parser and scorer against 10 sample resumes.</p>
                  </div>
                  <button 
                    onClick={() => {
                      validateMockResumes();
                      setIsSettingsOpen(false);
                    }}
                    disabled={isValidatingMock}
                    className="flex items-center gap-2 rounded-xl bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-950 transition-colors hover:bg-stone-200 disabled:opacity-50"
                  >
                    {isValidatingMock ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
                    Run Validation
                  </button>
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
