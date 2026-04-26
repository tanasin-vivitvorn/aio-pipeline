'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, AlertCircle, Shield, Activity, Clock, ExternalLink } from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlaywrightStats {
  total: number;
  expected: number;
  unexpected: number;
  skipped: number;
  ok: boolean;
  duration: number;
}

// Matches real Playwright JSON reporter output
interface PWResult {
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  duration: number;
  errors: Array<{ message?: string }>;
}

interface PWTestItem {
  // "expected" = passed as expected, "unexpected" = failed, "flaky" = flaky, "skipped"
  status: 'expected' | 'unexpected' | 'flaky' | 'skipped';
  expectedStatus: string;
  results: PWResult[];
}

interface PWSpec {
  title: string;
  ok: boolean;
  tests: PWTestItem[];
}

interface PlaywrightSuite {
  title: string;
  specs?: PWSpec[];
  suites?: PlaywrightSuite[];
}

// Flattened row used for display
interface FlatTest {
  title: string;
  outcome: 'passed' | 'failed' | 'flaky' | 'skipped';
  duration: number;
  error?: string;
}

interface ZapAlert {
  name: string;
  risk: string;
  riskcode: string;
  confidence: string;
  url: string;
  description: string;
  solution?: string;
}

// Field names match JMeter JTL CSV headers exactly
interface JmeterSample {
  timeStamp?:       string;
  elapsed?:         string;
  label?:           string;
  responseCode?:    string;
  responseMessage?: string;
  threadName?:      string;
  success?:         string;
  failureMessage?:  string;
  bytes?:           string;
  sentBytes?:       string;
  URL?:             string;
  Latency?:         string;
  Connect?:         string;
  [key: string]:    string | undefined;   // tolerate extra / renamed fields
}

interface SummaryReport {
  build: string;
  timestamp: string;
  targetUrl: string;
  inventory?: string;
  playwright?: { stats?: PlaywrightStats; suites?: PlaywrightSuite[] } | null;
  zap?:        { scanType: string; alerts?: { alerts?: ZapAlert[] } | null } | null;
  jmeter?:     JmeterSample[] | null;
}

// ─── SVG Charts ──────────────────────────────────────────────────────────────

function DonutChart({ passed, failed, size = 120 }: { passed: number; failed: number; size?: number }) {
  const total = passed + failed;
  if (total === 0) return <div className="text-gray-400 text-sm">No data</div>;
  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;
  const passAngle = (passed / total) * 360;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = cx + r * Math.sin(toRad(0));
  const y1 = cy - r * Math.cos(toRad(0));
  const x2 = cx + r * Math.sin(toRad(passAngle));
  const y2 = cy - r * Math.cos(toRad(passAngle));
  const large = passAngle > 180 ? 1 : 0;
  const passPath = total === passed
    ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}`
    : `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;

  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#fee2e2" strokeWidth={18} />
      {passed > 0 && (
        <path d={passed === total
          ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}`
          : passPath}
          fill="none" stroke="#22c55e" strokeWidth={18} strokeLinecap="butt" />
      )}
      <text x={cx} y={cy - 6} textAnchor="middle" className="text-xs" fontSize={14} fontWeight="bold" fill="#1f2937">
        {Math.round((passed / total) * 100)}%
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize={10} fill="#6b7280">passed</text>
    </svg>
  );
}

function BarChart({ bars, height = 140 }: { bars: { label: string; value: number; color: string }[]; height?: number }) {
  if (!bars.length) return null;
  const max = Math.max(...bars.map(b => b.value), 1);
  const barW = 40;
  const gap = 16;
  const width = bars.length * (barW + gap) + gap;
  const chartH = height - 30;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {bars.map((bar, i) => {
        const bh = Math.max((bar.value / max) * chartH, bar.value > 0 ? 4 : 0);
        const x = gap + i * (barW + gap);
        const y = chartH - bh;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bh} fill={bar.color} rx={3} />
            {bar.value > 0 && (
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize={11} fill="#374151" fontWeight="600">
                {bar.value}
              </text>
            )}
            <text x={x + barW / 2} y={height - 4} textAnchor="middle" fontSize={10} fill="#6b7280">
              {bar.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Risk badge ───────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  High:           'bg-red-100 text-red-800',
  Medium:         'bg-orange-100 text-orange-800',
  Low:            'bg-yellow-100 text-yellow-800',
  Informational:  'bg-blue-100 text-blue-800',
};

const RISK_BAR_COLORS: Record<string, string> = {
  High: '#ef4444', Medium: '#f97316', Low: '#eab308', Informational: '#3b82f6',
};

function RiskBadge({ risk }: { risk: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RISK_COLORS[risk] ?? 'bg-gray-100 text-gray-700'}`}>
      {risk}
    </span>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function flattenPlaywrightTests(suites?: PlaywrightSuite[]): FlatTest[] {
  if (!suites) return [];
  const flat: FlatTest[] = [];

  const walk = (suite: PlaywrightSuite, prefix: string) => {
    const label = prefix ? `${prefix} › ${suite.title}` : suite.title;
    suite.specs?.forEach(spec => {
      spec.tests?.forEach(t => {
        const lastResult = t.results?.[t.results.length - 1];
        const outcome: FlatTest['outcome'] =
          t.status === 'expected'   ? 'passed'  :
          t.status === 'flaky'      ? 'flaky'   :
          t.status === 'skipped'    ? 'skipped' : 'failed';

        flat.push({
          title:    `${label} › ${spec.title}`,
          outcome,
          duration: lastResult?.duration ?? 0,
          error:    lastResult?.errors?.[0]?.message,
        });
      });
    });
    suite.suites?.forEach(s => walk(s, label));
  };

  suites.forEach(s => walk(s, ''));
  return flat;
}

function fmtMs(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Section components ───────────────────────────────────────────────────────

const OUTCOME_UI = {
  passed:  { icon: <CheckCircle className="w-4 h-4" />, text: 'Passed',  cls: 'text-green-600' },
  failed:  { icon: <XCircle     className="w-4 h-4" />, text: 'Failed',  cls: 'text-red-600'   },
  flaky:   { icon: <AlertCircle className="w-4 h-4" />, text: 'Flaky',   cls: 'text-yellow-600' },
  skipped: { icon: <AlertCircle className="w-4 h-4" />, text: 'Skipped', cls: 'text-gray-400'  },
};

function PlaywrightSection({ data }: { data: SummaryReport['playwright'] }) {
  if (!data) return <p className="text-gray-400 italic">Playwright was not run.</p>;

  const stats  = data.stats;
  const tests  = flattenPlaywrightTests(data.suites);
  const passed  = stats?.expected   ?? tests.filter(t => t.outcome === 'passed').length;
  const failed  = stats?.unexpected ?? tests.filter(t => t.outcome === 'failed' || t.outcome === 'flaky').length;
  const skipped = stats?.skipped    ?? tests.filter(t => t.outcome === 'skipped').length;
  const total   = stats?.total      ?? tests.length;

  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-8 flex-wrap">
        <DonutChart passed={passed} failed={failed} size={120} />
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total',   value: total,   color: 'text-gray-700'  },
            { label: 'Passed',  value: passed,  color: 'text-green-600' },
            { label: 'Failed',  value: failed,  color: failed  > 0 ? 'text-red-600'    : 'text-green-600' },
            { label: 'Skipped', value: skipped, color: skipped > 0 ? 'text-yellow-600' : 'text-gray-400'  },
          ].map(m => (
            <div key={m.label} className="text-center">
              <p className={`text-3xl font-bold ${m.color}`}>{m.value}</p>
              <p className="text-xs text-gray-500 mt-1">{m.label}</p>
            </div>
          ))}
          {stats?.duration !== undefined && (
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-700">{fmtMs(stats.duration)}</p>
              <p className="text-xs text-gray-500 mt-1">Duration</p>
            </div>
          )}
        </div>
      </div>

      {tests.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Test</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tests.map((t, i) => {
                const ui = OUTCOME_UI[t.outcome];
                return (
                  <>
                    <tr
                      key={i}
                      className={`hover:bg-gray-50 ${t.error ? 'cursor-pointer' : ''}`}
                      onClick={() => t.error && setExpanded(expanded === i ? null : i)}
                    >
                      <td className="px-4 py-2 text-gray-800">{t.title}</td>
                      <td className="px-4 py-2">
                        <span className={`flex items-center gap-1 ${ui.cls}`}>
                          {ui.icon}{ui.text}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-gray-500">{fmtMs(t.duration)}</td>
                    </tr>
                    {expanded === i && t.error && (
                      <tr key={`${i}-err`} className="bg-red-50">
                        <td colSpan={3} className="px-4 py-2">
                          <pre className="text-xs text-red-700 whitespace-pre-wrap">{t.error}</pre>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ZapSection({ data }: { data: SummaryReport['zap'] }) {
  if (!data) return <p className="text-gray-400 italic">ZAP was not run.</p>;

  const alerts: ZapAlert[] = data.alerts?.alerts ?? [];
  const counts: Record<string, number> = {};
  alerts.forEach(a => { counts[a.risk] = (counts[a.risk] ?? 0) + 1; });

  const bars = ['High', 'Medium', 'Low', 'Informational']
    .filter(r => counts[r] !== undefined)
    .map(r => ({ label: r.slice(0, 4), value: counts[r]!, color: RISK_BAR_COLORS[r] }));

  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-10 flex-wrap">
        <div>
          <p className="text-sm font-medium text-gray-500 mb-3">Risk Distribution</p>
          <BarChart bars={bars} height={160} />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-1">
          {['High', 'Medium', 'Low', 'Informational'].map(r => (
            <div key={r} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${RISK_COLORS[r] ?? ''}`}>
              <span className="text-xl font-bold">{counts[r] ?? 0}</span>
              <span className="text-sm font-medium">{r}</span>
            </div>
          ))}
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Alert</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Risk</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">URL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {alerts.map((a, i) => (
                <>
                  <tr key={i} className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpanded(expanded === i ? null : i)}>
                    <td className="px-4 py-2 text-gray-800 font-medium">{a.name}</td>
                    <td className="px-4 py-2"><RiskBadge risk={a.risk} /></td>
                    <td className="px-4 py-2 text-gray-500 max-w-xs truncate text-xs">{a.url}</td>
                  </tr>
                  {expanded === i && (
                    <tr key={`${i}-detail`} className="bg-gray-50">
                      <td colSpan={3} className="px-4 py-3 space-y-2">
                        <p className="text-gray-600 text-xs">{a.description}</p>
                        {a.solution && <p className="text-green-700 text-xs"><strong>Solution:</strong> {a.solution}</p>}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {alerts.length === 0 && <p className="text-green-600 font-medium">No alerts found.</p>}
    </div>
  );
}

function JmeterSection({ data }: { data: SummaryReport['jmeter'] }) {
  if (!data || !data.length) return <p className="text-gray-400 italic">JMeter was not run.</p>;

  const [view, setView] = useState<'summary' | 'requests'>('summary');

  // Normalise field lookup — JTL keys are case-sensitive CSV headers
  const get = (s: JmeterSample, ...keys: string[]) => {
    for (const k of keys) if (s[k] !== undefined) return s[k] as string;
    return '';
  };

  const label   = (s: JmeterSample) => get(s, 'label', 'Label', 'sampler_label');
  const elapsed = (s: JmeterSample) => Number(get(s, 'elapsed', 'Elapsed') || 0);
  const success = (s: JmeterSample) => get(s, 'success', 'Success') === 'true';
  const code    = (s: JmeterSample) => get(s, 'responseCode', 'responseCode', 'Response Code');
  const msg     = (s: JmeterSample) => get(s, 'responseMessage', 'Response Message');
  const url     = (s: JmeterSample) => get(s, 'URL', 'url');
  const ts      = (s: JmeterSample) => {
    const v = get(s, 'timeStamp', 'Timestamp');
    return v ? new Date(Number(v)).toLocaleTimeString() : '';
  };
  const latency = (s: JmeterSample) => get(s, 'Latency', 'latency');
  const bytes   = (s: JmeterSample) => get(s, 'bytes', 'Bytes');
  const failMsg = (s: JmeterSample) => get(s, 'failureMessage', 'Failure Message');

  // Aggregate by label
  const byLabel: Record<string, { count: number; totalMs: number; minMs: number; maxMs: number; errors: number }> = {};
  data.forEach(s => {
    const lbl = label(s) || '(unknown)';
    const ms  = elapsed(s);
    if (!byLabel[lbl]) byLabel[lbl] = { count: 0, totalMs: 0, minMs: Infinity, maxMs: 0, errors: 0 };
    byLabel[lbl].count++;
    byLabel[lbl].totalMs += ms;
    if (ms < byLabel[lbl].minMs) byLabel[lbl].minMs = ms;
    if (ms > byLabel[lbl].maxMs) byLabel[lbl].maxMs = ms;
    if (!success(s)) byLabel[lbl].errors++;
  });

  const total    = data.length;
  const errCount = data.filter(s => !success(s)).length;
  const avgMs    = Math.round(data.reduce((a, s) => a + elapsed(s), 0) / total);

  const bars = Object.entries(byLabel).map(([lbl, v]) => ({
    label: lbl.length > 8 ? lbl.slice(0, 7) + '…' : lbl,
    value: Math.round(v.totalMs / v.count),
    color: v.errors > 0 ? '#ef4444' : '#3b82f6',
  }));

  return (
    <div className="space-y-6">
      {/* Metrics + chart */}
      <div className="flex items-start gap-10 flex-wrap">
        <div>
          <p className="text-sm font-medium text-gray-500 mb-3">Avg Response Time (ms) per Label</p>
          <BarChart bars={bars} height={160} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-1">
          {[
            { label: 'Samples',    value: total,                                      color: 'text-gray-700'  },
            { label: 'Errors',     value: errCount,                                   color: errCount > 0 ? 'text-red-600' : 'text-green-600' },
            { label: 'Error Rate', value: `${((errCount / total) * 100).toFixed(1)}%`, color: errCount > 0 ? 'text-red-600' : 'text-green-600' },
            { label: 'Avg (ms)',   value: avgMs,                                       color: 'text-blue-600'  },
          ].map(m => (
            <div key={m.label} className="text-center">
              <p className={`text-3xl font-bold ${m.color}`}>{m.value}</p>
              <p className="text-xs text-gray-500 mt-1">{m.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-2">
        {(['summary', 'requests'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              view === v ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {v === 'summary' ? 'Summary' : `Requests (${total})`}
          </button>
        ))}
      </div>

      {/* Summary table — aggregate per label */}
      {view === 'summary' && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left  px-4 py-3 font-semibold text-gray-600">Label</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600"># Samples</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Avg (ms)</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Min (ms)</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Max (ms)</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Errors</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Error %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Object.entries(byLabel).map(([lbl, v]) => (
                <tr key={lbl} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-800 font-medium">{lbl}</td>
                  <td className="px-4 py-2 text-right">{v.count}</td>
                  <td className="px-4 py-2 text-right">{Math.round(v.totalMs / v.count)}</td>
                  <td className="px-4 py-2 text-right">{v.minMs === Infinity ? '—' : v.minMs}</td>
                  <td className="px-4 py-2 text-right">{v.maxMs}</td>
                  <td className={`px-4 py-2 text-right font-medium ${v.errors > 0 ? 'text-red-600' : ''}`}>{v.errors}</td>
                  <td className={`px-4 py-2 text-right font-medium ${v.errors > 0 ? 'text-red-600' : ''}`}>
                    {((v.errors / v.count) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Requests table — one row per sample */}
      {view === 'requests' && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left  px-4 py-3 font-semibold text-gray-600">Time</th>
                <th className="text-left  px-4 py-3 font-semibold text-gray-600">Label</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Elapsed (ms)</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Latency (ms)</th>
                <th className="text-left  px-4 py-3 font-semibold text-gray-600">Code</th>
                <th className="text-left  px-4 py-3 font-semibold text-gray-600">Message</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Bytes</th>
                <th className="text-left  px-4 py-3 font-semibold text-gray-600">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((s, i) => {
                const ok = success(s);
                return (
                  <tr key={i} className={`hover:bg-gray-50 ${!ok ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{ts(s)}</td>
                    <td className="px-4 py-2 text-gray-800 font-medium">{label(s)}</td>
                    <td className="px-4 py-2 text-right">{elapsed(s)}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{latency(s) || '—'}</td>
                    <td className={`px-4 py-2 font-mono ${!ok ? 'text-red-600' : 'text-gray-700'}`}>{code(s)}</td>
                    <td className="px-4 py-2 text-gray-600">{msg(s)}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{bytes(s)}</td>
                    <td className="px-4 py-2">
                      {ok
                        ? <span className="flex items-center gap-1 text-green-600"><CheckCircle className="w-3.5 h-3.5" />Pass</span>
                        : <span className="flex items-center gap-1 text-red-600 text-xs" title={failMsg(s)}>
                            <XCircle className="w-3.5 h-3.5" />Fail
                          </span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

const TABS = ['Overview', 'Playwright', 'ZAP Security', 'JMeter'] as const;

export default function ReportView() {
  const searchParams = useSearchParams();
  const jobName     = searchParams.get('jobName') ?? '';
  const buildNumber = searchParams.get('buildNumber') ?? '';

  const [report, setReport] = useState<SummaryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [tab,     setTab]     = useState<typeof TABS[number]>('Overview');

  useEffect(() => {
    if (!jobName || !buildNumber) { setError('Missing jobName or buildNumber'); setLoading(false); return; }
    const segments = [...jobName.split('/'), buildNumber].map(encodeURIComponent).join('/');
    apiFetch(`/api/jenkins/report/${segments}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setReport(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [jobName, buildNumber]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <Activity className="w-10 h-10 animate-spin text-blue-500 mx-auto" />
        <p className="mt-3 text-gray-600">Loading report…</p>
      </div>
    </div>
  );

  if (error || !report) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md">
        <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
        <p className="mt-3 text-red-600 font-medium">{error ?? 'No report data'}</p>
        <p className="mt-1 text-gray-400 text-sm">The report may not exist yet for this build.</p>
      </div>
    </div>
  );

  // Overview metrics
  const pwStats   = report.playwright?.stats;
  const pwTests   = flattenPlaywrightTests(report.playwright?.suites);
  const pwPassed  = pwStats?.expected   ?? pwTests.filter(t => t.outcome === 'passed').length;
  const pwFailed  = pwStats?.unexpected ?? pwTests.filter(t => t.outcome === 'failed' || t.outcome === 'flaky').length;
  const pwTotal   = pwStats?.total      ?? pwTests.length;
  const zapAlerts = report.zap?.alerts?.alerts ?? [];
  const jmSamples = report.jmeter ?? [];
  const jmErrors  = jmSamples.filter(s => s.success === 'false').length;
  const highCrit  = zapAlerts.filter(a => a.riskcode === '3' || a.riskcode === '4').length;

  const overviewCards = [
    {
      icon: <CheckCircle className="w-6 h-6 text-green-500" />,
      label: 'Playwright',
      main: pwTotal > 0 ? `${pwPassed}/${pwTotal}` : '—',
      sub: pwTotal > 0 ? (pwFailed === 0 ? 'All passed' : `${pwFailed} failed`) : 'Not run',
      color: pwFailed > 0 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50',
    },
    {
      icon: <Shield className="w-6 h-6 text-orange-500" />,
      label: 'ZAP Security',
      main: `${zapAlerts.length}`,
      sub: highCrit > 0 ? `${highCrit} High/Critical` : 'No high risks',
      color: highCrit > 0 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50',
    },
    {
      icon: <Activity className="w-6 h-6 text-blue-500" />,
      label: 'JMeter',
      main: jmSamples.length > 0 ? `${jmErrors > 0 ? ((jmErrors / jmSamples.length) * 100).toFixed(1) + '%' : '0%'}` : '—',
      sub: jmSamples.length > 0 ? `Error rate · ${jmSamples.length} samples` : 'Not run',
      color: jmErrors > 0 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b shadow-sm px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Build Report</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              <span className="font-medium text-gray-700">{jobName}</span>
              {' · '}Build #{buildNumber}
            </p>
          </div>
          <div className="text-right text-sm text-gray-500 space-y-0.5">
            {report.targetUrl && (
              <p className="flex items-center gap-1 justify-end">
                <ExternalLink className="w-3.5 h-3.5" />
                <a href={report.targetUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                  {report.targetUrl}
                </a>
              </p>
            )}
            {report.timestamp && (
              <p className="flex items-center gap-1 justify-end">
                <Clock className="w-3.5 h-3.5" />
                {new Date(report.timestamp).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Overview cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {overviewCards.map(c => (
            <div key={c.label} className={`rounded-xl border p-4 flex items-center gap-4 ${c.color}`}>
              {c.icon}
              <div>
                <p className="text-2xl font-bold text-gray-800">{c.main}</p>
                <p className="text-xs text-gray-500 mt-0.5">{c.label} · {c.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border shadow-sm">
          <div className="flex border-b overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px
                  ${tab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="p-6">
            {tab === 'Overview' && (
              <div className="space-y-4">
                {report.inventory && (
                  <div>
                    <h3 className="font-semibold text-gray-700 mb-2">Inventory Scan</h3>
                    <pre className="bg-gray-50 border rounded-lg p-4 text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap">
                      {report.inventory}
                    </pre>
                  </div>
                )}
                <p className="text-sm text-gray-500">Select a tab above to view detailed results.</p>
              </div>
            )}
            {tab === 'Playwright'   && <PlaywrightSection data={report.playwright} />}
            {tab === 'ZAP Security' && <ZapSection        data={report.zap} />}
            {tab === 'JMeter'       && <JmeterSection     data={report.jmeter} />}
          </div>
        </div>
      </div>
    </div>
  );
}
