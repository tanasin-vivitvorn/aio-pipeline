import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ segments: string[] }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { segments } = await params;
  if (segments.length < 2) {
    return NextResponse.json({ error: 'Invalid path — expected [...jobParts, buildNumber]' }, { status: 400 });
  }

  const buildNumber = segments[segments.length - 1];
  const jobParts   = segments.slice(0, -1);

  const jenkinsUrl  = (process.env.JENKINS_URL || 'http://jenkins:8080').replace(/\/$/, '');
  const jenkinsUser = process.env.JENKINS_USERNAME || 'admin';
  const jenkinsToken = process.env.JENKINS_TOKEN || '';

  if (!jenkinsToken) {
    return NextResponse.json({ error: 'Jenkins credentials not configured' }, { status: 500 });
  }

  const jobPath   = jobParts.map(seg => `job/${encodeURIComponent(seg)}`).join('/');
  const reportUrl = `${jenkinsUrl}/${jobPath}/${buildNumber}/execution/node/3/ws/reports/summary-report.json`;
  const auth      = 'Basic ' + Buffer.from(`${jenkinsUser}:${jenkinsToken}`).toString('base64');

  try {
    const res = await fetch(reportUrl, {
      headers: { Authorization: auth },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Jenkins workspace returned ${res.status}`, url: reportUrl },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
