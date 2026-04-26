'use client';

import { CheckCircle, XCircle, Clock, AlertCircle, Eye, BarChart2 } from 'lucide-react';

interface Build {
  number: number;
  result: string | null;
  building: boolean;
  duration: number;
  timestamp: number;
  url: string;
  displayName: string;
}

interface BuildHistoryProps {
  builds: Build[];
  jobName: string;
  onViewBuild: (buildNumber: number) => void;
}

export default function BuildHistory({ builds, jobName, onViewBuild }: BuildHistoryProps) {
  const getStatusIcon = (build: Build) => {
    if (build.building) {
      return <Clock className="w-4 h-4 text-blue-500 animate-spin" />;
    }
    
    switch (build.result) {
      case 'SUCCESS':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'FAILURE':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'UNSTABLE':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'ABORTED':
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (build: Build) => {
    if (build.building) return 'border-l-blue-500 bg-blue-50';
    
    switch (build.result) {
      case 'SUCCESS':
        return 'border-l-green-500 bg-green-50';
      case 'FAILURE':
        return 'border-l-red-500 bg-red-50';
      case 'UNSTABLE':
        return 'border-l-yellow-500 bg-yellow-50';
      case 'ABORTED':
        return 'border-l-gray-500 bg-gray-50';
      default:
        return 'border-l-gray-400 bg-gray-50';
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
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  if (builds.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No build history available</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {builds.map((build) => (
        <div
          key={build.number}
          className={`border-l-4 ${getStatusColor(build)} p-4 rounded-r-lg hover:shadow-md transition-shadow cursor-pointer`}
          onClick={() => onViewBuild(build.number)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              {getStatusIcon(build)}
              
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800">
                    #{build.number}
                  </span>
                  {build.building && (
                    <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full">
                      Building
                    </span>
                  )}
                  {build.result && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      build.result === 'SUCCESS' ? 'bg-green-200 text-green-800' :
                      build.result === 'FAILURE' ? 'bg-red-200 text-red-800' :
                      build.result === 'UNSTABLE' ? 'bg-yellow-200 text-yellow-800' :
                      'bg-gray-200 text-gray-800'
                    }`}>
                      {build.result}
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                  <span>{formatTimestamp(build.timestamp)}</span>
                  {!build.building && build.duration > 0 && (
                    <>
                      <span>•</span>
                      <span>{formatDuration(build.duration)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const url = `/report?jobName=${encodeURIComponent(jobName)}&buildNumber=${build.number}`;
                  window.open(url, '_blank');
                }}
                className="p-2 hover:bg-white rounded-md transition-colors"
                title="View report"
              >
                <BarChart2 className="w-4 h-4 text-blue-500" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onViewBuild(build.number);
                }}
                className="p-2 hover:bg-white rounded-md transition-colors"
                title="View details"
              >
                <Eye className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
