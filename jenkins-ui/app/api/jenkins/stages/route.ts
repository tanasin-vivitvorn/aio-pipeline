import { NextRequest, NextResponse } from 'next/server';
import JenkinsService from '@/lib/jenkinsService';
import { getSessionFromRequest, jobBelongsToTenant } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const jobName = searchParams.get('jobName');
    const buildNumber = searchParams.get('buildNumber');

    if (!jobName || !buildNumber) {
      return NextResponse.json(
        { error: 'Job name and build number are required' },
        { status: 400 }
      );
    }

    if (!jobBelongsToTenant(jobName, session.tenant)) {
      return NextResponse.json({ error: 'Forbidden', stages: [] }, { status: 403 });
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

    const stages = await jenkins.getPipelineStages(jobName, Number.parseInt(buildNumber, 10));

    // Transform Jenkins stages to our format
    const formattedStages = stages.map((stage: any) => {
      let status: string;
      if (stage.status === 'SUCCESS') status = 'success';
      else if (stage.status === 'FAILED') status = 'failure';
      else if (stage.status === 'IN_PROGRESS') status = 'in_progress';
      else if (stage.status === 'SKIPPED') status = 'skipped';
      else status = 'pending';

      return { name: stage.name, status, durationMillis: stage.durationMillis };
    });

    return NextResponse.json({ stages: formattedStages });
  } catch (error: any) {
    console.error('Error fetching pipeline stages:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch pipeline stages', stages: [] },
      { status: 200 } // Return 200 with empty stages if pipeline not available
    );
  }
}
