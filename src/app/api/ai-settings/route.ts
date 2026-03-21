import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import axios from 'axios';

// Validar token no Chatwoot para segurança
async function validateToken(chatwootUrl: string, token: string, client?: string, uid?: string) {
  try {
    const headers: any = { 'api_access_token': token };
    if (client) headers['client'] = client;
    if (uid) headers['uid'] = uid;

    const res = await axios.get(`${chatwootUrl}/api/v1/profile`, { headers });
    return res.data;
  } catch (error) {
    return null;
  }
}

// Fetch inboxes available to the account
async function getChatwootInboxes(chatwootUrl: string, accountId: string, token: string) {
  try {
    const res = await axios.get(`${chatwootUrl}/api/v1/accounts/${accountId}/inboxes`, {
      headers: { 'api_access_token': token }
    });
    return res.data.payload.map((i: any) => ({
      id: i.id,
      name: i.name,
      channel_type: i.channel_type
    }));
  } catch (err) {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId');
  const token = searchParams.get('token');
  const chatwootUrl = searchParams.get('chatwootUrl');
  const client = searchParams.get('client');
  const uid = searchParams.get('uid');

  if (!accountId || !token || !chatwootUrl) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  const profile = await validateToken(chatwootUrl, token, client || undefined, uid || undefined);
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tenant = await prisma.tenant.findFirst({
      where: {
        accountId: parseInt(accountId, 10),
        chatwootUrl: chatwootUrl
      },
      include: {
        aiAgent: true
      }
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Role detection: SuperAdmins have access to all Tenants 
    // Simplification for MVP: If email/role indicates superadmin, we could return all
    // Mas por enquanto retornamos o agent apenas deste Tenant
    let agent = tenant.aiAgent;

    // Se nao existir, criamos um default mockado só em memória para form
    if (!agent) {
      agent = {
        id: 'new',
        tenantId: tenant.id,
        isActive: false,
        prompt: '',
        openAiKey: '',
        elevenLabsApiKey: '',
        elevenLabsVoiceId: '',
        modelName: 'gpt-4o-mini',
        temperature: 0.2,
        inboxIds: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }

    // Buscar Inboxes da conta no Chatwoot para o painel de seleção
    const inboxes = await getChatwootInboxes(chatwootUrl, accountId, token);

    // Calculando totais do painel financeiro do tenant
    const usages = await prisma.tokenUsage.findMany({
      where: { tenantId: tenant.id }
    });

    const totalTokens = usages.reduce((acc, curr) => acc + curr.promptTokens + curr.completionTokens, 0);
    const totalCost = usages.reduce((acc, curr) => acc + curr.totalCost, 0);

    return NextResponse.json({
      agent,
      inboxes,
      financial: {
        totalTokens,
        totalCost: parseFloat(totalCost.toFixed(4)),
        interactions: usages.length
      }
    });
  } catch (error) {
    console.error('[API] Error fetching AI Settings:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId');
  const token = searchParams.get('token');
  const chatwootUrl = searchParams.get('chatwootUrl');
  
  if (!accountId || !token || !chatwootUrl) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  const profile = await validateToken(chatwootUrl, token);
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tenant = await prisma.tenant.findFirst({
      where: {
        accountId: parseInt(accountId, 10),
        chatwootUrl: chatwootUrl
      }
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const data = await request.json();

    const updatedAgent = await prisma.aiAgent.upsert({
      where: {
        tenantId: tenant.id
      },
      update: {
        isActive: data.isActive,
        prompt: data.prompt,
        openAiKey: data.openAiKey,
        elevenLabsApiKey: data.elevenLabsApiKey,
        elevenLabsVoiceId: data.elevenLabsVoiceId,
        modelName: data.modelName,
        temperature: parseFloat(data.temperature || "0.2"),
        inboxIds: Array.isArray(data.inboxIds) ? data.inboxIds : []
      },
      create: {
        tenantId: tenant.id,
        isActive: data.isActive,
        prompt: data.prompt,
        openAiKey: data.openAiKey,
        elevenLabsApiKey: data.elevenLabsApiKey,
        elevenLabsVoiceId: data.elevenLabsVoiceId,
        modelName: data.modelName || 'gpt-4o-mini',
        temperature: parseFloat(data.temperature || "0.2"),
        inboxIds: Array.isArray(data.inboxIds) ? data.inboxIds : []
      }
    });

    return NextResponse.json({ success: true, agent: updatedAgent });
  } catch (error) {
    console.error('[API] Error saving AI Settings:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
