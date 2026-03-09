import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!['RUNNING', 'PAUSED', 'CANCELLED'].includes(status)) {
        return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
    }

    // Atualiza a campanha
    const campaign = await prisma.campaign.update({
        where: { id },
        data: { status }
    });

    // Se o usuário está RETOMANDO a campanha (de PAUSED para RUNNING)
    // Precisamos re-agendar as mensagens pendentes para a partir de *agora*
    if (status === 'RUNNING') {
        const pendingMessages = await prisma.scheduledMessage.findMany({
            where: { campaignId: id, status: 'PENDING' },
            orderBy: { scheduledAt: 'asc' },
            take: 1
        });

        if (pendingMessages.length > 0) {
            const now = new Date();
            const earliest = pendingMessages[0].scheduledAt;
            
            // Se o horário agendado original já passou (porque ficou pausado), empurramos tudo pra frente
            if (earliest < now) {
                // A diferença em milissegundos do momento em tela para o schedule original
                const diffMs = now.getTime() - earliest.getTime();
                
                // Usa raw query no Postgres para somar o interval em todas as pendentes dessa campanha
                await prisma.$executeRaw`
                  UPDATE "ScheduledMessage" 
                  SET "scheduledAt" = "scheduledAt" + (${diffMs} * interval '1 millisecond') 
                  WHERE "campaignId" = ${id} AND "status" = 'PENDING'
                `;
            }
        }
    }

    // Se cancelou, cancela todas as mensagens pendentes
    if (status === 'CANCELLED') {
        await prisma.scheduledMessage.updateMany({
            where: {
                campaignId: id,
                status: 'PENDING'
            },
            data: {
                status: 'CANCELLED',
                errorLog: 'Cancelado pelo usuário'
            }
        });
    }

    return NextResponse.json({ success: true, campaign });
  } catch (error) {
      console.error('Error updating campaign:', error);
      return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
