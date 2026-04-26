'use client';

import { useEffect, useState } from 'react';
import { X, RefreshCw, StopCircle, Terminal, BarChart2 } from 'lucide-react';
import StageProgress from './StageProgress';
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

interface StageStatus {
  name: string;
  status: 'success' | 'failure' | 'in_progress' | 'pending' | 'skipped';
  durationMillis?: number;
}

interface BuildDetailsProps {
  jobName: string;
  buildNumber: number;
  onClose: () => void;
}

export default function BuildDetails({ jobName, buildNumber, onClose }: BuildDetailsProps) {
  const [build, setBuild] = useState<Build | null>(null);
  const [consoleOutput, setConsoleOutput] = useState<string>('');
  const [stages, setStages] = useState<StageStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchBuildDetails = async () => {
    try {
      const response = await apiFetch(`/api/jenkins/build/${encodeURIComponent(jobName)}/${buildNumber}?console=true`);
      const data = await response.json();
      
      if (data.build) {
        setBuild(data.build);
        setConsoleOutput(data.consoleOutput || '');
        
        // Stop auto-refresh if build is complete
        if (!data.build.building) {
          setAutoRefresh(false);
        }
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching build details:', error);
      setLoading(false);
    }
  };

  const fetchStages = async () => {
    try {
      const response = await apiFetch(`/api/jenkins/stages?jobName=${encodeURIComponent(jobName)}&buildNumber=${buildNumber}`);
      const data = await response.json();
      
      if (data.stages && data.stages.length > 0) {
        setStages(data.stages);
      }
    } catch (error) {
      console.error('Error fetching stages:', error);
    }
  };

  const stopBuild = async () => {
    try {
      await apiFetch(`/api/jenkins/build/${encodeURIComponent(jobName)}/${buildNumber}`, {
        method: 'DELETE',
      });
      fetchBuildDetails();
    } catch (error) {
      console.error('Error stopping build:', error);
    }
  };

  useEffect(() => {
    fetchBuildDetails();
    fetchStages();
  }, [jobName, buildNumber]);

  useEffect(() => {
    if (autoRefresh && build?.building) {
      const interval = setInterval(() => {
        fetchBuildDetails();
        fetchStages();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, build?.building]);

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 3600 % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-jenkins-blue" />
            <span>Loading build details...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              {jobName} - Build #{buildNumber}
            </h2>
            {build && (
              <p className="text-sm text-gray-600 mt-1">
                {build.building ? (
                  <span className="text-blue-600 font-medium">Building...</span>
                ) : (
                  <span className={`font-medium ${
                    build.result === 'SUCCESS' ? 'text-green-600' :
                    build.result === 'FAILURE' ? 'text-red-600' :
                    'text-yellow-600'
                  }`}>
                    {build.result}
                  </span>
                )}
                {' '}- Duration: {formatDuration(build.duration)}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const url = `/report?jobName=${encodeURIComponent(jobName)}&buildNumber=${buildNumber}`;
                window.open(url, '_blank');
              }}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors text-blue-500"
              title="View Report"
            >
              <BarChart2 className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                fetchBuildDetails();
                fetchStages();
              }}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${autoRefresh ? 'animate-spin' : ''}`} />
            </button>
            {build?.building && (
              <button
                onClick={stopBuild}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors text-red-600"
                title="Stop Build"
              >
                <StopCircle className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Stage Progress */}
          {stages.length > 0 && (
            <StageProgress stages={stages} />
          )}

          {/* Console Output */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <Terminal className="w-5 h-5 text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-800">Console Output</h3>
            </div>
            <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-96">
              <pre className="text-green-400 text-sm font-mono whitespace-pre-wrap">
                {consoleOutput || 'No console output available'}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
