import { NextRequest, NextResponse } from 'next/server';
import JenkinsService from '@/lib/jenkinsService';
import { getSessionFromRequest, jobBelongsToTenant } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobName: string[] }> }
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

    const { jobName: jobSegments } = await params;
    const jobName = jobSegments.join('/');

    if (!jobBelongsToTenant(jobName, session.tenant)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const job = await jenkins.getJob(jobName);
    const parameters = jenkins.extractParameters(job);

    return NextResponse.json({ job, parameters });
  } catch (error: any) {
    console.error('Error fetching job:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch job' },
      { status: 500 }
    );
  }
}
