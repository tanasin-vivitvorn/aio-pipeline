'use client';

import { useEffect, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import BuildHistory from './BuildHistory';
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

interface BuildHistoryModalProps {
  jobName: string;
  onClose: () => void;
  onViewBuild: (jobName: string, buildNumber: number) => void;
}

export default function BuildHistoryModal({ jobName, onClose, onViewBuild }: BuildHistoryModalProps) {
  const [builds, setBuilds] = useState<Build[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBuilds = async () => {
    try {
      setLoading(true);
      const response = await apiFetch(`/api/jenkins/jobs/${encodeURIComponent(jobName)}`);
      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        setBuilds(data.job?.builds || []);
        setError(null);
      }
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch build history');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBuilds();
  }, [jobName]);

  const handleViewBuild = (buildNumber: number) => {
    onViewBuild(jobName, buildNumber);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Build History</h2>
            <p className="text-sm text-gray-600 mt-1">{jobName}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchBuilds}
              disabled={loading}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-jenkins-blue" />
              <span className="ml-3 text-gray-600">Loading build history...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={fetchBuilds}
                className="px-4 py-2 bg-jenkins-blue text-white rounded-md hover:bg-opacity-90"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Showing {builds.length} recent builds
                </p>
              </div>
              <BuildHistory builds={builds} jobName={jobName} onViewBuild={handleViewBuild} />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
