import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> } // Params must be a Promise in Next.js 15+
) {
  try {
    const { id } = await params; // Await the params
    const body = await request.json();
    const { message, scheduledAt } = body;

    const updated = await prisma.scheduledMessage.update({
      where: { id: String(id) },
      data: {
        content: message,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      }
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('❌ Erro ao atualizar:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> } // Params must be a Promise in Next.js 15+
) {
  try {
    const { id } = await params; // Await the params
    await prisma.scheduledMessage.delete({
      where: { id: String(id) }
    });

    return NextResponse.json({ success: true, message: 'Deleted' });
  } catch (error) {
    console.error('❌ Erro ao deletar:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
