'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Package, ArrowLeft, Download, AlertCircle, Loader2, Search } from 'lucide-react';

interface Asset {
  path: string;
  downloadUrl: string;
  contentType: string;
  fileSize: number;
  lastModified: string;
}

interface Component {
  id: string;
  name: string;
  version: string;
  group: string;
  format: string;
  assets: Asset[];
}

export default function RepositoryPage() {
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repository, setRepository] = useState('sum');
  const [search, setSearch] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchComponents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/nexus/assets?repository=${encodeURIComponent(repository)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch');
      setComponents(data.items || []);
      setLastRefresh(new Date());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchComponents(); }, [repository]);

  const filtered = components.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.group?.toLowerCase().includes(search.toLowerCase()) ||
    c.version?.toLowerCase().includes(search.toLowerCase())
  );

  const formatSize = (bytes: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const formatDate = (iso: string) => (!iso ? '-' : new Date(iso).toLocaleString());

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-500 hover:text-gray-700"><ArrowLeft className="w-5 h-5" /></Link>
            <Package className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-semibold text-gray-900">Repository</h1>
            <span className="text-sm text-gray-400">Nexus</span>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && <span className="text-xs text-gray-400">Updated {lastRefresh.toLocaleTimeString()}</span>}
            <button onClick={fetchComponents} disabled={loading} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search components..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <input type="text" placeholder="Repository name" value={repository} onChange={e => setRepository(e.target.value)} onBlur={fetchComponents} onKeyDown={e => e.key === 'Enter' && fetchComponents()} className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-40" />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}
        {loading && <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>}
        {!loading && !error && (
          <>
            <div className="text-sm text-gray-500">{filtered.length} component{filtered.length !== 1 ? 's' : ''} in <span className="font-medium text-gray-700">{repository}</span></div>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {filtered.length === 0 ? (
                <div className="py-16 text-center text-gray-400 text-sm">No components found</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Version</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Group / Path</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Size</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Last Modified</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Download</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map(component => {
                      const asset = component.assets?.[0];
                      return (
                        <tr key={component.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900">{component.name || asset?.path?.split('/').pop() || '-'}</td>
                          <td className="px-4 py-3 text-gray-600">{component.version || '-'}</td>
                          <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{component.group || asset?.path || '-'}</td>
                          <td className="px-4 py-3 text-gray-500">{formatSize(asset?.fileSize)}</td>
                          <td className="px-4 py-3 text-gray-500">{formatDate(asset?.lastModified)}</td>
                          <td className="px-4 py-3">
                            {asset?.downloadUrl ? (
                              <a href={asset.downloadUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:text-blue-800">
                                <Download className="w-4 h-4" />Download
                              </a>
                            ) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
