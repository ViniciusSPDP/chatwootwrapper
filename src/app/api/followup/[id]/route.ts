import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { note, scheduledAt, status } = body;

    const updated = await prisma.followUp.update({
      where: { id: String(id) },
      data: {
        note,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        status
      }
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('❌ Error updating follow-up:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.followUp.delete({
      where: { id: String(id) }
    });

    return NextResponse.json({ success: true, message: 'Deleted' });
  } catch (error) {
    console.error('❌ Error deleting follow-up:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
