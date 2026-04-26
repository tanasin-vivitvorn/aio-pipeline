'use client';

import { PlayCircle, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

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

interface JobCardProps {
  job: Job;
  onTriggerBuild: (jobName: string) => void;
  onViewDetails: (jobName: string) => void;
  onViewHistory?: (jobName: string) => void;
}

export default function JobCard({ job, onTriggerBuild, onViewDetails, onViewHistory }: JobCardProps) {
  const getStatusIcon = () => {
    if (job.lastBuild?.building) {
      return <Clock className="w-5 h-5 text-blue-500 animate-spin" />;
    }
    
    switch (job.lastBuild?.result) {
      case 'SUCCESS':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'FAILURE':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'UNSTABLE':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = () => {
    if (job.lastBuild?.building) return 'border-blue-500';
    
    switch (job.lastBuild?.result) {
      case 'SUCCESS':
        return 'border-green-500';
      case 'FAILURE':
        return 'border-red-500';
      case 'UNSTABLE':
        return 'border-yellow-500';
      default:
        return 'border-gray-500';
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className={`bg-white rounded-lg shadow-md border-l-4 ${getStatusColor()} p-6 hover:shadow-lg transition-shadow`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <h3 className="text-lg font-semibold text-gray-800">{job.name}</h3>
            {job.lastBuild && (
              <p className="text-sm text-gray-500">
                Build #{job.lastBuild.number}
                {job.lastBuild.building ? ' - Building...' : ` - ${job.lastBuild.result}`}
              </p>
            )}
          </div>
        </div>
      </div>

      {job.lastBuild && (
        <div className="mb-4 space-y-2 text-sm text-gray-600">
          <div className="flex justify-between">
            <span>Duration:</span>
            <span className="font-medium">{formatDuration(job.lastBuild.duration)}</span>
          </div>
          <div className="flex justify-between">
            <span>Started:</span>
            <span className="font-medium">{formatTimestamp(job.lastBuild.timestamp)}</span>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onTriggerBuild(job.name)}
          className="flex-1 bg-jenkins-blue text-white px-4 py-2 rounded-md hover:bg-opacity-90 transition-colors flex items-center justify-center gap-2"
        >
          <PlayCircle className="w-4 h-4" />
          Build Now
        </button>
        <button
          onClick={() => onViewDetails(job.name)}
          className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors"
        >
          View Details
        </button>
      </div>
      
      {onViewHistory && (
        <button
          onClick={() => onViewHistory(job.name)}
          className="w-full mt-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-50 transition-colors text-sm"
        >
          Build History
        </button>
      )}
    </div>
  );
}
