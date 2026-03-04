import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const token = searchParams.get('token');
    const client = searchParams.get('client') || '';
    const uid = searchParams.get('uid') || '';
    const chatwootUrl = searchParams.get('chatwootUrl');

    if (!accountId || !token || !chatwootUrl) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const response = await fetch(`${chatwootUrl}/api/v1/accounts/${accountId}/labels`, {
      headers: {
        'access-token': token,
        'client': client,
        'uid': uid
      }
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error('Chatwoot error:', errText);
        throw new Error(`Failed to fetch labels: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data: data.payload || data });
  } catch (error) {
    console.error('Error fetching labels:', error);
    return NextResponse.json({ error: 'Error fetching labels' }, { status: 500 });
  }
}
