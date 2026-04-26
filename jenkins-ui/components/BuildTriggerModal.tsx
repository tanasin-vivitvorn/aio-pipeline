'use client';

import { useState, useEffect } from 'react';
import { X, PlayCircle, RefreshCw, Upload } from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';

interface BuildParameter {
  name: string;
  value: string | boolean;
}

interface JobParameter {
  name: string;
  type: string;
  defaultValue?: any;
  description?: string;
  choices?: string[];
}

interface BuildTriggerModalProps {
  jobName: string;
  onClose: () => void;
  onTrigger: (jobName: string, parameters: BuildParameter[]) => void;
}

export default function BuildTriggerModal({ jobName, onClose, onTrigger }: BuildTriggerModalProps) {
  const [jobParameters, setJobParameters] = useState<JobParameter[]>([]);
  const [parameters, setParameters] = useState<{ [key: string]: any }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJobParameters();
  }, [jobName]);

  const fetchJobParameters = async () => {
    try {
      setLoading(true);
      const response = await apiFetch(`/api/jenkins/jobs/${encodeURIComponent(jobName)}`);
      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        setJobParameters(data.parameters || []);
        
        // Initialize parameter values with defaults
        const initialParams: { [key: string]: any } = {};
        (data.parameters || []).forEach((param: JobParameter) => {
          initialParams[param.name] = param.defaultValue !== undefined ? param.defaultValue : '';
        });
        setParameters(initialParams);
      }
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch job parameters');
      setLoading(false);
    }
  };

  const handleParameterChange = (name: string, value: any) => {
    setParameters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFileChange = (name: string, file: File | null) => {
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result?.toString().split(',')[1] || '';
        setParameters(prev => ({
          ...prev,
          [name]: base64
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTrigger = () => {
    const buildParams: BuildParameter[] = Object.entries(parameters).map(([name, value]) => ({
      name,
      value: typeof value === 'boolean' ? value.toString() : value
    }));
    onTrigger(jobName, buildParams);
    onClose();
  };

  const renderParameterInput = (param: JobParameter) => {
    const value = parameters[param.name];

    switch (param.type) {
      case 'boolean':
        return (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={param.name}
              checked={value === true || value === 'true'}
              onChange={(e) => handleParameterChange(param.name, e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-jenkins-blue focus:ring-jenkins-blue"
            />
            <label htmlFor={param.name} className="text-sm text-gray-700 cursor-pointer">
              {param.description || param.name}
            </label>
          </div>
        );

      case 'choice':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {param.name}
              {param.description && (
                <span className="block text-xs text-gray-500 font-normal">{param.description}</span>
              )}
            </label>
            <select
              value={value || param.defaultValue || ''}
              onChange={(e) => handleParameterChange(param.name, e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-jenkins-blue"
            >
              {param.choices?.map((choice) => (
                <option key={choice} value={choice}>
                  {choice}
                </option>
              ))}
            </select>
          </div>
        );

      case 'password':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {param.name}
              {param.description && (
                <span className="block text-xs text-gray-500 font-normal">{param.description}</span>
              )}
            </label>
            <input
              type="password"
              value={value || ''}
              onChange={(e) => handleParameterChange(param.name, e.target.value)}
              placeholder={param.description || param.name}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-jenkins-blue"
            />
          </div>
        );

      case 'text':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {param.name}
              {param.description && (
                <span className="block text-xs text-gray-500 font-normal">{param.description}</span>
              )}
            </label>
            <textarea
              value={value || ''}
              onChange={(e) => handleParameterChange(param.name, e.target.value)}
              placeholder={param.description || param.name}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-jenkins-blue"
            />
          </div>
        );

      case 'base64file':
      case 'file':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {param.name}
              {param.description && (
                <span className="block text-xs text-gray-500 font-normal">{param.description}</span>
              )}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                id={param.name}
                onChange={(e) => handleFileChange(param.name, e.target.files?.[0] || null)}
                className="hidden"
              />
              <label
                htmlFor={param.name}
                className="flex-1 cursor-pointer flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-md hover:border-jenkins-blue hover:bg-gray-50 transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span className="text-sm text-gray-600">
                  {value ? 'File uploaded ✓' : 'Click to upload'}
                </span>
              </label>
            </div>
          </div>
        );

      default: // string
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {param.name}
              {param.description && (
                <span className="block text-xs text-gray-500 font-normal">{param.description}</span>
              )}
            </label>
            <input
              type="text"
              value={value || ''}
              onChange={(e) => handleParameterChange(param.name, e.target.value)}
              placeholder={param.description || param.name}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-jenkins-blue"
            />
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800">
            Trigger Build: {jobName}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Parameters */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-jenkins-blue" />
              <span className="ml-3 text-gray-600">Loading parameters...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600">{error}</p>
              <button
                onClick={fetchJobParameters}
                className="mt-4 px-4 py-2 bg-jenkins-blue text-white rounded-md hover:bg-opacity-90"
              >
                Retry
              </button>
            </div>
          ) : jobParameters.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">This job has no parameters</p>
              <p className="text-sm text-gray-400 mt-2">Click "Trigger Build" to start the job</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Build Parameters</h3>
              {jobParameters.map((param) => (
                <div key={param.name}>
                  {renderParameterInput(param)}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleTrigger}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-jenkins-blue text-white rounded-md hover:bg-opacity-90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlayCircle className="w-5 h-5" />
            Trigger Build
          </button>
        </div>
      </div>
    </div>
  );
}
