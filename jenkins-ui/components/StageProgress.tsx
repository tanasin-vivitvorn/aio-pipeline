'use client';

import { CheckCircle, XCircle, Clock, Loader2, Circle } from 'lucide-react';

interface StageStatus {
  name: string;
  status: 'success' | 'failure' | 'in_progress' | 'pending' | 'skipped';
  durationMillis?: number;
}

interface StageProgressProps {
  stages: StageStatus[];
}

export default function StageProgress({ stages }: StageProgressProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failure':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'in_progress':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'skipped':
        return <Circle className="w-5 h-5 text-gray-400" />;
      default: // pending
        return <Circle className="w-5 h-5 text-gray-300" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-500';
      case 'failure':
        return 'bg-red-500';
      case 'in_progress':
        return 'bg-blue-500';
      case 'skipped':
        return 'bg-gray-400';
      default: // pending
        return 'bg-gray-300';
    }
  };

  const getStatusBorderColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'border-green-500';
      case 'failure':
        return 'border-red-500';
      case 'in_progress':
        return 'border-blue-500';
      case 'skipped':
        return 'border-gray-400';
      default: // pending
        return 'border-gray-300';
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Pipeline Stages</h3>
      
      <div className="flex items-start gap-2">
        {stages.map((stage, index) => (
          <div key={index} className="flex items-center flex-1">
            {/* Stage Box */}
            <div className="flex flex-col items-center flex-1">
              {/* Stage Icon and Name */}
              <div className={`flex flex-col items-center p-3 rounded-lg border-2 ${getStatusBorderColor(stage.status)} bg-white w-full`}>
                <div className="mb-2">
                  {getStatusIcon(stage.status)}
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-800 break-words">
                    {stage.name}
                  </p>
                  {stage.durationMillis && stage.status !== 'pending' && (
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDuration(stage.durationMillis)}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Connector Line */}
            {index < stages.length - 1 && (
              <div className="flex items-center justify-center px-2">
                <div className={`h-0.5 w-8 ${
                  stages[index + 1].status === 'pending' || stages[index + 1].status === 'skipped'
                    ? 'bg-gray-300'
                    : stages[index].status === 'success'
                    ? 'bg-green-500'
                    : stages[index].status === 'failure'
                    ? 'bg-red-500'
                    : 'bg-blue-500'
                }`} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-gray-600">Overall Progress</span>
          <span className="text-sm font-medium text-gray-800">
            {stages.filter(s => s.status === 'success' || s.status === 'failure').length} / {stages.length}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-500"
            style={{
              width: `${(stages.filter(s => s.status === 'success' || s.status === 'failure').length / stages.length) * 100}%`
            }}
          />
        </div>
      </div>
    </div>
  );
}
