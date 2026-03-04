import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      name,
      label,
      inboxId,
      message,
      minDelay,
      maxDelay,
      chatwootUrl,
      accountId,
      token,
      client,
      uid
    } = body;

    if (!name || !label || !inboxId || !message || minDelay == null || maxDelay == null || !chatwootUrl || !token) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    console.log(`🚀 Iniciando criação da campanha "${name}" para a etiqueta "${label}"...`);

    // 1. Encontrar ou Criar o Tenant
    const tenant = await prisma.tenant.upsert({
      where: {
        chatwootUrl_accountId: {
          chatwootUrl: chatwootUrl,
          accountId: Number(accountId)
        }
      },
      update: {
        apiAccessToken: token,
        client: client || undefined,
        uid: uid || undefined
      },
      create: {
        chatwootUrl,
        apiAccessToken: token,
        accountId: Number(accountId),
        client: client,
        uid: uid
      }
    });

    // 2. Buscar contatos com a etiqueta
    const contactsUrl = `${chatwootUrl}/api/v1/accounts/${accountId}/contacts?labels=${encodeURIComponent(label)}`;
    const contactsRes = await fetch(contactsUrl, {
      headers: {
        'access-token': token,
        'client': client || '',
        'uid': uid || ''
      }
    });

    if (!contactsRes.ok) {
      const errText = await contactsRes.text();
      console.error('Chatwoot error fetch contacts:', errText);
      throw new Error(`Falha ao buscar contatos: ${contactsRes.status}`);
    }

    const contactsData = await contactsRes.json();
    const contacts = contactsData.payload || contactsData;

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ error: 'Nenhum contato encontrado com essa etiqueta' }, { status: 404 });
    }

    console.log(`Encontrados ${contacts.length} contatos para a etiqueta "${label}".`);

    // 3. Criar a Campanha
    const campaign = await prisma.campaign.create({
      data: {
        name: name,
        tenantId: tenant.id,
        totalContacts: contacts.length,
        status: 'RUNNING',
      }
    });

    // 4. Calcular os agendamentos respeitando o delay randômico e limite diário
    let lastTime = new Date();
    // Adiciona o primeiro delay imediatamente para a primeira mensagem
    // lastTime continuará sendo incrementado
    const maxPerDay = 50;

    const scheduledMessages = [];

    for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];

        // Se excedeu 50 no dia, pula 24 horas a partir do horário da última mensagem
        if (i > 0 && i % maxPerDay === 0) {
            lastTime.setDate(lastTime.getDate() + 1);
        }

        // Delay randômico entre minDelay e maxDelay (em minutos)
        const randomDelayMinutes = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        lastTime = new Date(lastTime.getTime() + randomDelayMinutes * 60000);

        scheduledMessages.push({
            content: message,
            scheduledAt: new Date(lastTime),
            status: 'PENDING',
            tenantId: tenant.id,
            campaignId: campaign.id,
            contactId: contact.id,
            inboxId: Number(inboxId),
            // conversationId é nulo por enquanto. O Worker criará a conversa se não existir.
        });
    }

    // Usando createMany para otimizar
    await prisma.scheduledMessage.createMany({
        data: scheduledMessages
    });

    return NextResponse.json({
        success: true,
        campaignId: campaign.id,
        scheduledCount: scheduledMessages.length
    });

  } catch (error) {
    console.error('Error creating campaign:', error);
    return NextResponse.json({ error: 'Erro interno ao criar campanha.' }, { status: 500 });
  }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const accountId = searchParams.get('accountId');
        const chatwootUrl = searchParams.get('chatwootUrl');

        if (!accountId || !chatwootUrl) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const tenant = await prisma.tenant.findUnique({
            where: {
                chatwootUrl_accountId: {
                    chatwootUrl: chatwootUrl,
                    accountId: Number(accountId)
                }
            },
            include: {
                campaigns: {
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        if (!tenant) {
            return NextResponse.json({ success: true, data: [] });
        }

        return NextResponse.json({ success: true, data: tenant.campaigns });
    } catch (error) {
        console.error('Error fetching campaigns:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
