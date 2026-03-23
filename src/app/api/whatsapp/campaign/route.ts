import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      name,
      label,
      wabaId,
      phoneNumberId,
      accessToken,
      templateName,
      templateLanguage,
      templateVarMap, // [{position: 1, source: "name"|"phone"|"attr"|"static", value: "..."}]
      minDelaySeconds,
      maxDelaySeconds,
      chatwootUrl,
      accountId,
      token,
      client,
      uid,
      postSendLabel,
    } = body;

    if (
      !name || !label || !wabaId || !phoneNumberId || !accessToken ||
      !templateName || !templateLanguage || !chatwootUrl || !token ||
      minDelaySeconds == null || maxDelaySeconds == null
    ) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    // 1. Encontrar ou criar o Tenant
    const tenant = await prisma.tenant.upsert({
      where: {
        chatwootUrl_accountId: {
          chatwootUrl,
          accountId: Number(accountId),
        },
      },
      update: {
        apiAccessToken: token,
        client: client || undefined,
        uid: uid || undefined,
      },
      create: {
        chatwootUrl,
        apiAccessToken: token,
        accountId: Number(accountId),
        client,
        uid,
      },
    });

    // 2. Buscar conversas com a etiqueta
    const conversationsUrl = `${chatwootUrl}/api/v1/accounts/${accountId}/conversations?labels=${encodeURIComponent(label)}&status=all`;
    const conversationsRes = await fetch(conversationsUrl, {
      headers: {
        'access-token': token,
        'client': client || '',
        'uid': uid || '',
      },
    });

    if (!conversationsRes.ok) {
      const errText = await conversationsRes.text();
      throw new Error(`Falha ao buscar conversas: ${conversationsRes.status} - ${errText}`);
    }

    const conversationsData = await conversationsRes.json();
    let conversations = conversationsData.payload || conversationsData.data || conversationsData;
    if (conversationsData.data && conversationsData.data.payload) {
      conversations = conversationsData.data.payload;
    }
    if (!Array.isArray(conversations)) conversations = [];

    if (conversations.length === 0) {
      return NextResponse.json({ error: 'Nenhuma conversa encontrada com essa etiqueta' }, { status: 404 });
    }

    console.log(`🚀 [WA Campaign] "${name}" — ${conversations.length} conversas para label "${label}"`);

    const varMap: Array<{ position: number; source: string; value: string }> = templateVarMap || [];

    // 3. Calcular agendamentos (delays em segundos)
    let lastTime = new Date();
    const scheduledMessages = [];

    for (const conversation of conversations) {
      const sender = conversation.meta?.sender || {};
      const contactName: string = sender.name || '';
      const rawPhone: string = sender.phone_number || '';
      const phone = rawPhone.replace(/\D/g, ''); // só dígitos

      if (!phone) {
        console.warn(`[WA Campaign] Conversa ${conversation.id} sem telefone, pulando.`);
        continue;
      }

      // Delay aleatório entre contatos (em segundos)
      const randomDelay = Math.floor(Math.random() * (maxDelaySeconds - minDelaySeconds + 1)) + minDelaySeconds;
      lastTime = new Date(lastTime.getTime() + randomDelay * 1000);

      // Resolver variáveis para este contato
      const resolvedVars: Record<string, string> = {};
      for (const varDef of varMap) {
        const pos = String(varDef.position);
        if (varDef.source === 'name') {
          resolvedVars[pos] = contactName;
        } else if (varDef.source === 'phone') {
          resolvedVars[pos] = rawPhone || phone;
        } else if (varDef.source === 'static') {
          resolvedVars[pos] = varDef.value || '';
        } else if (varDef.source === 'attr') {
          // Deixa como {{attr_key}} para o worker resolver no momento do envio
          resolvedVars[pos] = `{{${varDef.value}}}`;
        }
      }

      const contentJson = JSON.stringify({
        type: 'WA_TEMPLATE',
        phone,
        templateName,
        language: templateLanguage,
        variables: resolvedVars,
      });

      scheduledMessages.push({
        content: contentJson,
        scheduledAt: new Date(lastTime),
        status: 'PENDING',
        tenantId: tenant.id,
        conversationId: conversation.id || null,
        contactId: sender.id || null,
        inboxId: conversation.inbox_id || null,
      });
    }

    if (scheduledMessages.length === 0) {
      return NextResponse.json({ error: 'Nenhum contato com número de telefone válido encontrado' }, { status: 404 });
    }

    // 4. Criar a campanha
    const campaign = await prisma.campaign.create({
      data: {
        name,
        tenantId: tenant.id,
        type: 'WHATSAPP_API',
        status: 'RUNNING',
        totalContacts: scheduledMessages.length,
        postSendLabel: postSendLabel || null,
        wabaId,
        phoneNumberId,
        accessToken,
        templateName,
        templateLanguage,
        templateVarMap: JSON.stringify(varMap),
      },
    });

    const finalMessages = scheduledMessages.map((msg) => ({
      ...msg,
      campaignId: campaign.id,
    }));

    await prisma.scheduledMessage.createMany({ data: finalMessages });

    console.log(`✅ [WA Campaign] Criada: ${campaign.id} — ${scheduledMessages.length} mensagens agendadas`);

    return NextResponse.json({
      success: true,
      campaignId: campaign.id,
      scheduledCount: scheduledMessages.length,
    });
  } catch (error) {
    console.error('Error creating WA campaign:', error);
    return NextResponse.json({ error: 'Erro interno ao criar campanha WA.' }, { status: 500 });
  }
}
