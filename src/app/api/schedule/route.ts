// src/app/api/schedule/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 1. Validar dados recebidos (Basicão)
    const { 
      message, 
      scheduledAt, 
      conversationId, 
      accountId, 
      chatwootUrl, 
      token 
    } = body;

    if (!message || !scheduledAt || !conversationId || !chatwootUrl || !token) {
      return NextResponse.json(
        { error: 'Dados incompletos. Verifique o payload.' },
        { status: 400 }
      );
    }

    console.log(`📩 Recebido agendamento para conversa ${conversationId}`);

    // 2. Encontrar ou Criar o Tenant (Auto-Onboarding)
    // Usamos 'upsert': se existe atualiza o token, se não existe cria.
    const tenant = await prisma.tenant.upsert({
      where: { chatwootUrl: chatwootUrl },
      update: {
        apiAccessToken: token, // Atualiza o token caso tenha mudado
        accountId: Number(accountId)
      },
      create: {
        chatwootUrl,
        apiAccessToken: token,
        accountId: Number(accountId)
      }
    });

    // 3. Salvar o Agendamento no Banco
    const agendamento = await prisma.scheduledMessage.create({
      data: {
        content: message,
        scheduledAt: new Date(scheduledAt), // Converte string ISO para Date
        conversationId: Number(conversationId),
        status: 'PENDING',
        tenantId: tenant.id
      }
    });

    console.log(`✅ Agendado com sucesso! ID: ${agendamento.id}`);

    // 4. Retornar sucesso
    return NextResponse.json({ 
      success: true, 
      data: agendamento 
    }, { status: 201 });

  } catch (error) {
    console.error('❌ Erro ao agendar:', error);
    return NextResponse.json(
      { error: 'Erro interno no servidor' }, 
      { status: 500 }
    );
  }
}