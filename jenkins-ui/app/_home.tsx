'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import JobCard from '@/components/JobCard';
import BuildDetails from '@/components/BuildDetails';
import BuildTriggerModal from '@/components/BuildTriggerModal';
import BuildHistoryModal from '@/components/BuildHistoryModal';
import { RefreshCw, AlertCircle, CheckCircle, Clock, Loader2, XCircle, Package, LogOut, User } from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';

interface Build {
  number: number;
  result: string | null;
  building: boolean;
  duration: number;
  timestamp: number;
  url: string;
  displayName: string;
}

interface Job {
  name: string;
  url: string;
  color: string;
  lastBuild: Build | null;
}

interface BuildParameter {
  name: string;
  value: string | boolean | number;
  type?: 'string' | 'boolean' | 'choice' | 'file';
}

interface BuildProgress {
  jobName: string;
  status: 'queued' | 'building' | 'success' | 'failure' | 'error';
  message: string;
  buildNumber?: number;
  queueUrl?: string;
  stages?: StageStatus[];
}

interface StageStatus {
  name: string;
  status: 'success' | 'failure' | 'in_progress' | 'pending' | 'skipped';
  durationMillis?: number;
}

export default function Home() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<{ jobName: string; buildNumber: number } | null>(null);
  const [triggerModalJob, setTriggerModalJob] = useState<string | null>(null);
  const [historyModalJob, setHistoryModalJob] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [buildProgress, setBuildProgress] = useState<BuildProgress | null>(null);
  const [currentUser, setCurrentUser] = useState<{ username: string; tenant: string } | null>(null);

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  };

  const fetchJobs = async () => {
    try {
      const response = await apiFetch('/api/jenkins/jobs');
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setJobs(data.jobs || []);
        setError(null);
      }
      setLoading(false);
    } catch {
      setError('Failed to connect to Jenkins');
      setLoading(false);
    }
  };

  const checkBuildStatus = async (jobName: string) => {
    try {
      const response = await apiFetch(`/api/jenkins/jobs/${encodeURIComponent(jobName)}`);
      const data = await response.json();
      if (data.job?.lastBuild) {
        const lastBuild = data.job.lastBuild;
        let stages: StageStatus[] = [];
        if (lastBuild.number) {
          try {
            const stagesResponse = await apiFetch(`/api/jenkins/stages?jobName=${encodeURIComponent(jobName)}&buildNumber=${lastBuild.number}`);
            const stagesData = await stagesResponse.json();
            stages = stagesData.stages || [];
          } catch {}
        }
        if (lastBuild.building) {
          setBuildProgress({ jobName, status: 'building', message: `Build #${lastBuild.number} is running...`, buildNumber: lastBuild.number, stages });
        } else if (lastBuild.result === 'SUCCESS') {
          setBuildProgress({ jobName, status: 'success', message: `Build #${lastBuild.number} completed successfully!`, buildNumber: lastBuild.number, stages });
          setTimeout(() => setBuildProgress(null), 5000);
        } else if (lastBuild.result === 'FAILURE') {
          setBuildProgress({ jobName, status: 'failure', message: `Build #${lastBuild.number} failed`, buildNumber: lastBuild.number, stages });
        }
      }
    } catch {}
  };

  const triggerBuild = async (jobName: string, parameters: BuildParameter[] = []) => {
    try {
      setBuildProgress({ jobName, status: 'queued', message: 'Queuing build...' });
      const response = await apiFetch('/api/jenkins/build', {
        method: 'POST',
        json: { jobName, parameters },
      });
      const data = await response.json();
      if (data.success) {
        setBuildProgress({ jobName, status: 'building', message: 'Build triggered! Waiting for build number...', queueUrl: data.queueUrl });
        const pollInterval = setInterval(async () => {
          await checkBuildStatus(jobName);
          await fetchJobs();
        }, 3000);
        setTimeout(() => clearInterval(pollInterval), 300000);
        setTimeout(() => checkBuildStatus(jobName), 2000);
      } else {
        setBuildProgress({ jobName, status: 'error', message: `Failed to trigger build: ${data.error}` });
      }
    } catch {
      setBuildProgress({ jobName, status: 'error', message: 'Failed to trigger build' });
    }
  };

  useEffect(() => {
    apiFetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => { if (d.username) setCurrentUser(d); })
      .catch(() => {});
    fetchJobs();
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchJobs, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
          <span className="text-xl text-gray-700">Loading Jenkins jobs...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <h2 className="text-2xl font-bold text-gray-800">Connection Error</h2>
          </div>
          <p className="text-gray-600 mb-6">{error}</p>
          <button onClick={fetchJobs} className="w-full bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 transition-colors">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-emerald-600">National ERP Platform</h1>
              <p className="text-sm text-gray-600 mt-1">โครงการระบบบัญชีโยธากันตังกังเพื่อกุศลทั้งเจิมและเจียม</p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/repository" className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors">
                <Package className="w-4 h-4" />
                Repository
              </Link>
              <label className="flex items-center gap-2 cursor-pointer text-gray-700">
                <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                <span className="text-sm font-medium">Auto-refresh</span>
              </label>
              <button onClick={fetchJobs} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              {currentUser && (
                <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-md text-sm text-gray-700">
                    <User className="w-4 h-4 text-gray-500" />
                    <span className="font-medium">{currentUser.username}</span>
                    {currentUser.tenant !== '*' && <span className="ml-1 px-1.5 py-0.5 text-xs bg-emerald-100 text-emerald-700 rounded font-medium">{currentUser.tenant}</span>}
                    {currentUser.tenant === '*' && <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded font-medium">admin</span>}
                  </div>
                  <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors" title="Sign out">
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {buildProgress && (
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {buildProgress.status === 'queued' && <Clock className="w-5 h-5 text-blue-500 animate-pulse" />}
                {buildProgress.status === 'building' && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
                {buildProgress.status === 'success' && <CheckCircle className="w-5 h-5 text-green-500" />}
                {buildProgress.status === 'failure' && <AlertCircle className="w-5 h-5 text-red-500" />}
                {buildProgress.status === 'error' && <AlertCircle className="w-5 h-5 text-orange-500" />}
                <div>
                  <p className="font-semibold text-gray-800">{buildProgress.jobName}</p>
                  <p className="text-sm text-gray-600">{buildProgress.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {buildProgress.buildNumber && (
                  <button onClick={() => { setSelectedJob({ jobName: buildProgress.jobName, buildNumber: buildProgress.buildNumber! }); setBuildProgress(null); }} className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors text-sm font-medium">
                    View Details
                  </button>
                )}
                <button onClick={() => setBuildProgress(null)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors text-sm font-medium">
                  Dismiss
                </button>
              </div>
            </div>
            {buildProgress.stages && buildProgress.stages.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto py-2">
                {buildProgress.stages.map((stage, index) => (
                  <div key={index} className="flex items-center">
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${stage.status === 'success' ? 'bg-green-100 text-green-800' : stage.status === 'failure' ? 'bg-red-100 text-red-800' : stage.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
                      {stage.status === 'success' && <CheckCircle className="w-3 h-3" />}
                      {stage.status === 'failure' && <XCircle className="w-3 h-3" />}
                      {stage.status === 'in_progress' && <Loader2 className="w-3 h-3 animate-spin" />}
                      {stage.status === 'pending' && <Clock className="w-3 h-3" />}
                      <span>{stage.name}</span>
                    </div>
                    {index < buildProgress.stages!.length - 1 && <div className="w-2 h-px bg-gray-300 mx-1" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <main className="container mx-auto px-6 py-8">
        {jobs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No jobs found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {jobs.map((job) => (
              <JobCard key={job.name} job={job} onTriggerBuild={(name) => setTriggerModalJob(name)} onViewDetails={(name) => { const j = jobs.find(x => x.name === name); if (j?.lastBuild) setSelectedJob({ jobName: name, buildNumber: j.lastBuild.number }); }} onViewHistory={(name) => setHistoryModalJob(name)} />
            ))}
          </div>
        )}
      </main>

      {selectedJob && <BuildDetails jobName={selectedJob.jobName} buildNumber={selectedJob.buildNumber} onClose={() => setSelectedJob(null)} />}
      {triggerModalJob && <BuildTriggerModal jobName={triggerModalJob} onClose={() => setTriggerModalJob(null)} onTrigger={triggerBuild} />}
      {historyModalJob && <BuildHistoryModal jobName={historyModalJob} onClose={() => setHistoryModalJob(null)} onViewBuild={(name, num) => setSelectedJob({ jobName: name, buildNumber: num })} />}
    </div>
  );
}
