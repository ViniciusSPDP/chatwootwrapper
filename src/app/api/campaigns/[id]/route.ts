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
