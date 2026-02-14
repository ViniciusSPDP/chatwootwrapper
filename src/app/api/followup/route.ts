import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      note, 
      scheduledAt, 
      conversationId, 
      chatwootUrl, 
      token,
      accountId
    } = body;

    if (!note || !scheduledAt || !conversationId || !chatwootUrl || !token) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Upsert Tenant
    const tenant = await prisma.tenant.upsert({
      where: { chatwootUrl: chatwootUrl },
      update: { apiAccessToken: token, accountId: Number(accountId) },
      create: { chatwootUrl, apiAccessToken: token, accountId: Number(accountId) }
    });

    const followUp = await prisma.followUp.create({
      data: {
        note,
        scheduledAt: new Date(scheduledAt),
        conversationId: Number(conversationId),
        status: 'PENDING',
        tenantId: tenant.id
      }
    });

    return NextResponse.json({ success: true, data: followUp }, { status: 201 });
  } catch (error) {
    console.error('❌ Error creating follow-up:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');

    if (!conversationId) {
      return NextResponse.json({ error: 'Conversation ID required' }, { status: 400 });
    }

    const followUps = await prisma.followUp.findMany({
      where: { conversationId: Number(conversationId) },
      orderBy: { scheduledAt: 'asc' }
    });

    return NextResponse.json({ success: true, data: followUps });
  } catch (error) {
    console.error('❌ Error fetching follow-ups:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
