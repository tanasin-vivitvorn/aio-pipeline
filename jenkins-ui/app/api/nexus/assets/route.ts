import { NextRequest, NextResponse } from 'next/server';

const NEXUS_URL = process.env.NEXUS_URL || 'http://nexus:8081';
const NEXUS_USERNAME = process.env.NEXUS_USERNAME || 'admin';
const NEXUS_PASSWORD = process.env.NEXUS_PASSWORD;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const repository = searchParams.get('repository') || 'sum';

  if (!NEXUS_PASSWORD) {
    return NextResponse.json({ error: 'Nexus credentials not configured' }, { status: 503 });
  }

  try {
    const auth = Buffer.from(`${NEXUS_USERNAME}:${NEXUS_PASSWORD}`).toString('base64');
    let allItems: any[] = [];
    let continuationToken: string | null = null;

    do {
      const url = new URL(`${NEXUS_URL}/service/rest/v1/components`);
      url.searchParams.set('repository', repository);
      if (continuationToken) url.searchParams.set('continuationToken', continuationToken);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
        cache: 'no-store',
      });

      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json(
          { error: `Nexus error: ${res.status} ${text}` },
          { status: res.status }
        );
      }

      const data = await res.json();
      allItems = allItems.concat(data.items || []);
      continuationToken = data.continuationToken || null;
    } while (continuationToken);

    return NextResponse.json({ items: allItems, total: allItems.length });
  } catch (error: any) {
    console.error('Error fetching Nexus assets:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch Nexus assets' },
      { status: 500 }
    );
  }
}