import 'dotenv/config';
import prisma from './lib/prisma';

const META_API_VERSION = 'v20.0';
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// Resolve {{attr_key}} in a string using conversation custom_attributes
async function resolveCustomAttributes(
  content: string,
  chatwootUrl: string,
  accountId: number,
  conversationId: number,
  headers: Record<string, string>
): Promise<string> {
  if (!content.includes('{{')) return content;

  try {
    const res = await fetchWithTimeout(
      `${chatwootUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}`,
      { headers }
    );
    if (!res.ok) return content;
    const data = await res.json();
    const attrs: Record<string, string> = data.custom_attributes || (data.payload && data.payload.custom_attributes) || {};

    return content.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return attrs[key] != null ? String(attrs[key]) : '';
    });
  } catch {
    return content;
  }
}

async function processScheduledMessages() {
  const now = new Date();

  console.log(`[Worker][${now.toISOString()}] Verificando mensagens pendentes...`);

  const messages = await prisma.scheduledMessage.findMany({
    where: {
      status: 'PENDING',
      scheduledAt: { lte: now },
      OR: [
        { campaignId: null },
        { campaign: { status: 'RUNNING' } }
      ]
    },
    include: {
      tenant: true,
      campaign: true
    },
    orderBy: { scheduledAt: 'asc' }
  });

  if (messages.length === 0) {
    const anyPending = await prisma.scheduledMessage.findFirst({
      where: {
        status: 'PENDING',
        OR: [
          { campaignId: null },
          { campaign: { status: 'RUNNING' } }
        ]
      },
      orderBy: { scheduledAt: 'asc' }
    });

    if (anyPending) {
      console.log(`[Worker] Próxima mensagem pendente: ${anyPending.scheduledAt.toISOString()}`);
    } else {
      console.log(`[Worker] Nenhuma mensagem pendente.`);
    }
  } else {
    console.log(`[Worker] Encontradas ${messages.length} mensagens para enviar.`);
  }

  for (const msg of messages) {
    try {
      console.log(`[Worker] Enviando MSG ID: ${msg.id} | Agendada: ${msg.scheduledAt.toISOString()}`);

      const { tenant, campaign } = msg;

      // ============================================================
      // BRANCH: WhatsApp API (Meta) campaign
      // ============================================================
      if (campaign?.type === 'WHATSAPP_API') {
        await handleWhatsAppApiMessage(msg, tenant, campaign);
        continue;
      }

      // ============================================================
      // BRANCH: Chatwoot campaign (existing logic)
      // ============================================================
      const headers: Record<string, string> = {
        'access-token': tenant.apiAccessToken,
        'client': tenant.client || '',
        'uid': tenant.uid || '',
      };

      let conversationId = msg.conversationId;

      if (!conversationId && msg.contactId && msg.inboxId) {
        console.log(`[Worker] Criando conversa para o contato ${msg.contactId}`);
        const createConvUrl = `${tenant.chatwootUrl}/api/v1/accounts/${tenant.accountId}/conversations`;

        try {
          const convRes = await fetchWithTimeout(createConvUrl, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              inbox_id: msg.inboxId,
              contact_id: String(msg.contactId),
              status: 'open'
            })
          });

          if (!convRes.ok) {
            const errText = await convRes.text();
            throw new Error(`Failed to create conversation: ${convRes.status} - ${errText}`);
          }

          const convData = await convRes.json();
          conversationId = convData.id || (convData.payload && convData.payload.id);

          if (!conversationId) throw new Error('Não foi possível obter o ID da conversa criada.');

          await prisma.scheduledMessage.update({
            where: { id: msg.id },
            data: { conversationId }
          });
        } catch (convErr) {
          console.error(`[Worker] Erro ao criar conversa:`, convErr);
          throw convErr;
        }
      }

      if (!conversationId) {
        throw new Error('Sem conversationId e sem dados para criar uma nova.');
      }

      // Resolve {{attr_key}} no content
      let resolvedContent = msg.content;
      if (resolvedContent.includes('{{')) {
        resolvedContent = await resolveCustomAttributes(
          resolvedContent,
          tenant.chatwootUrl,
          tenant.accountId,
          conversationId,
          headers
        );
      }

      const url = `${tenant.chatwootUrl}/api/v1/accounts/${tenant.accountId}/conversations/${conversationId}/messages`;

      let body: string | FormData;

      if (msg.attachmentUrl) {
        const attachmentRes = await fetchWithTimeout(msg.attachmentUrl);
        if (!attachmentRes.ok) throw new Error(`Failed to fetch attachment: ${attachmentRes.statusText}`);
        const blob = await attachmentRes.blob();

        const formData = new FormData();
        formData.append('content', msg.attachmentType === 'audio' ? '' : resolvedContent);
        formData.append('message_type', 'outgoing');
        formData.append('private', 'false');
        const filename = msg.attachmentName || 'file';
        formData.append('attachments[]', blob, filename);

        body = formData;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({
          content: resolvedContent,
          message_type: 'outgoing',
          private: false
        });
      }

      const response = await fetchWithTimeout(url, { method: 'POST', headers, body });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Chatwoot API Error: ${response.status} - ${errText}`);
      }

      await prisma.scheduledMessage.update({
        where: { id: msg.id },
        data: { status: 'SENT', errorLog: null }
      });

      // Aplicar etiqueta pós-envio
      if (msg.campaign && msg.campaign.postSendLabel) {
        await applyPostSendLabel(
          tenant.chatwootUrl,
          tenant.accountId,
          conversationId,
          msg.campaign.postSendLabel,
          headers
        );
      }

      await updateCampaignProgress(msg);

      console.log(`[Worker] Mensagem ${msg.id} enviada com sucesso (Chatwoot).`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Worker] Falha ao enviar mensagem ${msg.id}:`, errorMessage);

      await prisma.scheduledMessage.update({
        where: { id: msg.id },
        data: {
          status: 'FAILED',
          errorLog: errorMessage.slice(0, 1000)
        }
      });
    }
  }
}

// ============================================================
// WhatsApp API message handler
// ============================================================
async function handleWhatsAppApiMessage(
  msg: { id: string; content: string; conversationId: number | null; campaign: { phoneNumberId: string | null; accessToken: string | null; postSendLabel: string | null } | null; campaignId: string | null },
  tenant: { chatwootUrl: string; accountId: number; apiAccessToken: string; client: string | null; uid: string | null },
  campaign: { phoneNumberId: string | null; accessToken: string | null; postSendLabel: string | null }
) {
  let contentData: { type: string; phone: string; templateName: string; language: string; variables: Record<string, string> };

  try {
    contentData = JSON.parse(msg.content);
  } catch {
    throw new Error('WA_TEMPLATE: content JSON inválido');
  }

  if (!campaign.phoneNumberId || !campaign.accessToken) {
    throw new Error('WA_TEMPLATE: campaign sem phoneNumberId ou accessToken');
  }

  // Resolver {{attr_key}} nas variáveis se necessário
  const headers: Record<string, string> = {
    'access-token': tenant.apiAccessToken,
    'client': tenant.client || '',
    'uid': tenant.uid || '',
  };

  const resolvedVars: Record<string, string> = {};
  for (const [pos, val] of Object.entries(contentData.variables || {})) {
    if (typeof val === 'string' && val.includes('{{') && msg.conversationId) {
      resolvedVars[pos] = await resolveCustomAttributes(
        val,
        tenant.chatwootUrl,
        tenant.accountId,
        msg.conversationId,
        headers
      );
    } else {
      resolvedVars[pos] = val;
    }
  }

  // Montar componentes do template
  const bodyParameters = Object.entries(resolvedVars)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, text]) => ({ type: 'text', text }));

  const templatePayload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to: contentData.phone,
    type: 'template',
    template: {
      name: contentData.templateName,
      language: { code: contentData.language },
      ...(bodyParameters.length > 0 && {
        components: [{ type: 'body', parameters: bodyParameters }]
      })
    }
  };

  const metaRes = await fetchWithTimeout(
    `${META_BASE}/${campaign.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${campaign.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(templatePayload)
    }
  );

  const metaData = await metaRes.json();

  if (!metaRes.ok) {
    const errMsg = metaData?.error?.message || `Meta API Error: ${metaRes.status}`;
    throw new Error(errMsg);
  }

  const waMessageId = metaData.messages?.[0]?.id || null;

  await prisma.scheduledMessage.update({
    where: { id: msg.id },
    data: { status: 'SENT', errorLog: null, waMessageId }
  });

  // Aplicar etiqueta pós-envio
  if (campaign.postSendLabel && msg.conversationId) {
    await applyPostSendLabel(
      tenant.chatwootUrl,
      tenant.accountId,
      msg.conversationId,
      campaign.postSendLabel,
      headers
    );
  }

  await updateCampaignProgress(msg);

  console.log(`[Worker] Mensagem ${msg.id} enviada via Meta API. waMessageId: ${waMessageId}`);
}

// ============================================================
// Helpers compartilhados
// ============================================================
async function applyPostSendLabel(
  chatwootUrl: string,
  accountId: number,
  conversationId: number,
  label: string,
  headers: Record<string, string>
) {
  try {
    const getConvUrl = `${chatwootUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}`;
    const convRes = await fetchWithTimeout(getConvUrl, { headers });

    let currentLabels: string[] = [];
    if (convRes.ok) {
      const convDetails = await convRes.json();
      currentLabels = convDetails.labels || (convDetails.payload && convDetails.payload.labels) || [];
    }

    const newLabels = Array.from(new Set([...currentLabels, label]));
    const labelUrl = `${chatwootUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`;

    const labelRes = await fetchWithTimeout(labelUrl, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ labels: newLabels })
    });

    if (!labelRes.ok) {
      const errText = await labelRes.text();
      console.error(`[Worker] Falha ao aplicar etiqueta ${labelRes.status}: ${errText}`);
    } else {
      console.log(`[Worker] Etiqueta "${label}" aplicada.`);
    }
  } catch (err) {
    console.error(`[Worker] Erro ao aplicar etiqueta:`, err);
  }
}

async function updateCampaignProgress(
  msg: { campaignId: string | null; conversationId: number | null }
) {
  if (!msg.campaignId) return;

  const updatedCampaign = await prisma.campaign.update({
    where: { id: msg.campaignId },
    data: { sentCount: { increment: 1 } }
  });

  if (updatedCampaign.sentCount >= updatedCampaign.totalContacts) {
    await prisma.campaign.update({
      where: { id: msg.campaignId },
      data: { status: 'COMPLETED' }
    });
    console.log(`[Worker] Campanha ${updatedCampaign.id} finalizada (COMPLETED).`);
    return;
  }

  // Limite de 50 contatos/dia (apenas campanha Chatwoot)
  if (updatedCampaign.type === 'CHATWOOT') {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const sentToday = await prisma.scheduledMessage.findMany({
      where: {
        status: 'SENT',
        campaignId: msg.campaignId,
        scheduledAt: { gte: startOfDay }
      },
      select: { conversationId: true },
      distinct: ['conversationId']
    });

    if (sentToday.length >= 50) {
      await prisma.campaign.update({
        where: { id: msg.campaignId },
        data: { status: 'PAUSED' }
      });
      console.log(`[Worker] Limite de 50 contatos/dia atingido. Campanha ${msg.campaignId} pausada.`);
    }
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

async function runWorkerLoop() {
  try {
    await processScheduledMessages();
  } catch (err) {
    console.error('[Worker] Erro no loop:', err);
  } finally {
    setTimeout(runWorkerLoop, 10000);
  }
}

async function startWorker() {
  console.log('==============================================');
  console.log('[Worker] Iniciando loop de varredura...');
  console.log(`[Worker] Hora atual do servidor: ${new Date().toISOString()}`);
  console.log('==============================================');
  runWorkerLoop();
}

startWorker();
