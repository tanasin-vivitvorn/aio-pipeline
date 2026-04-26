import { NextRequest, NextResponse } from 'next/server';
import JenkinsService from '@/lib/jenkinsService';
import { getSessionFromRequest, jobBelongsToTenant } from '@/lib/auth';

export async function GET(request: NextRequest) {
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

    const allJobs = await jenkins.getJobs();

    // Return only jobs that belong to this user's tenant
    const jobs = allJobs.filter((job) => jobBelongsToTenant(job.name, session.tenant));

    return NextResponse.json({ jobs });
  } catch (error: any) {
    console.error('Error fetching jobs:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}
