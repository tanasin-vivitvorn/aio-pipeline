import { NextRequest, NextResponse } from 'next/server';
import JenkinsService from '@/lib/jenkinsService';
import { getSessionFromRequest, jobBelongsToTenant } from '@/lib/auth';

// URL pattern: /api/jenkins/build/<jobName...>/<buildNumber>
function parseSegments(segments: string[]): { jobName: string; buildNumber: number } | null {
  if (segments.length < 2) return null;
  const buildNumber = Number.parseInt(segments[segments.length - 1], 10);
  if (Number.isNaN(buildNumber)) return null;
  const jobName = segments.slice(0, -1).join('/');
  return { jobName, buildNumber };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ segments: string[] }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const includeConsole = searchParams.get('console') === 'true';

    const jenkinsUrl = process.env.JENKINS_URL || 'http://localhost:8080';
    const jenkinsUsername = process.env.JENKINS_USERNAME || 'admin';
    const jenkinsToken = process.env.JENKINS_TOKEN || '';

    if (!jenkinsToken) {
      return NextResponse.json(
        { error: 'Jenkins credentials not configured' },
        { status: 500 }
      );
    }

    const jenkins = new JenkinsService({
      url: jenkinsUrl,
      username: jenkinsUsername,
      token: jenkinsToken,
    });

    const { segments } = await params;
    const parsed = parseSegments(segments);
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    const { jobName, buildNumber } = parsed;

    if (!jobBelongsToTenant(jobName, session.tenant)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const build = await jenkins.getBuild(jobName, buildNumber);

    let consoleOutput = null;
    if (includeConsole) {
      consoleOutput = await jenkins.getConsoleOutput(jobName, buildNumber);
    }

    return NextResponse.json({ build, consoleOutput });
  } catch (error: any) {
    console.error('Error fetching build:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch build' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ segments: string[] }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const jenkinsUrl = process.env.JENKINS_URL || 'http://localhost:8080';
    const jenkinsUsername = process.env.JENKINS_USERNAME || 'admin';
    const jenkinsToken = process.env.JENKINS_TOKEN || '';

    if (!jenkinsToken) {
      return NextResponse.json(
        { error: 'Jenkins credentials not configured' },
        { status: 500 }
      );
    }

    const jenkins = new JenkinsService({
      url: jenkinsUrl,
      username: jenkinsUsername,
      token: jenkinsToken,
    });

    const { segments } = await params;
    const parsed = parseSegments(segments);
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    const { jobName, buildNumber } = parsed;

    if (!jobBelongsToTenant(jobName, session.tenant)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await jenkins.stopBuild(jobName, buildNumber);

    return NextResponse.json({
      success: true,
      message: `Build #${buildNumber} stopped`,
    });
  } catch (error: any) {
    console.error('Error stopping build:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to stop build' },
      { status: 500 }
    );
  }
}
