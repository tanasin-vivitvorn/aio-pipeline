import { NextRequest, NextResponse } from 'next/server';
import JenkinsService from '@/lib/jenkinsService';
import { getSessionFromRequest, jobBelongsToTenant } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { jobName, parameters } = body;

    if (!jobName) {
      return NextResponse.json(
        { error: 'Job name is required' },
        { status: 400 }
      );
    }

    if (!jobBelongsToTenant(jobName, session.tenant)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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

    console.log('Triggering build for job:', jobName);
    console.log('Parameters:', parameters?.length || 0, 'parameters');

    const result = await jenkins.triggerBuild(jobName, parameters);
    
    return NextResponse.json({ 
      success: true, 
      queueUrl: result.queueUrl,
      message: `Build triggered for ${jobName}` 
    });
  } catch (error: any) {
    console.error('Error triggering build:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to trigger build' },
      { status: 500 }
    );
  }
}
