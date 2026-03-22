import { NextResponse } from 'next/server';

const META_API_VERSION = 'v20.0';
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// GET — Lista templates existentes do WABA
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const wabaId = searchParams.get('waba_id');
    const accessToken = searchParams.get('access_token');

    if (!wabaId || !accessToken) {
      return NextResponse.json({ error: 'Parâmetros obrigatórios: waba_id, access_token' }, { status: 400 });
    }

    const fields = 'name,status,category,language,components';
    const res = await fetch(
      `${META_BASE}/${wabaId}/message_templates?fields=${fields}&limit=100`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    const data = await res.json();

    if (!res.ok) {
      const errMsg = data?.error?.message || `Erro Meta API: ${res.status}`;
      return NextResponse.json({ error: errMsg }, { status: res.status });
    }

    return NextResponse.json({ success: true, data: data.data || [] });
  } catch (error) {
    console.error('[whatsapp/templates GET] Erro:', error);
    return NextResponse.json({ error: 'Erro interno ao buscar templates' }, { status: 500 });
  }
}

// POST — Cria novo template no WABA via Meta Graph API
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { waba_id, access_token, template } = body;

    if (!waba_id || !access_token) {
      return NextResponse.json({ error: 'Parâmetros obrigatórios: waba_id, access_token' }, { status: 400 });
    }

    if (!template?.name || !template?.language || !template?.category || !template?.components) {
      return NextResponse.json({ error: 'Template incompleto: name, language, category e components são obrigatórios' }, { status: 400 });
    }

    const res = await fetch(`${META_BASE}/${waba_id}/message_templates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(template),
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg = data?.error?.message || `Erro Meta API: ${res.status}`;
      const errDetails = data?.error?.error_user_msg || '';
      return NextResponse.json(
        { error: errMsg, details: errDetails, meta_error: data?.error },
        { status: res.status }
      );
    }

    return NextResponse.json({ success: true, id: data.id, status: data.status });
  } catch (error) {
    console.error('[whatsapp/templates POST] Erro:', error);
    return NextResponse.json({ error: 'Erro interno ao criar template' }, { status: 500 });
  }
}
