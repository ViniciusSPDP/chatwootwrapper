import 'dotenv/config';
import prisma from './lib/prisma';

async function processScheduledMessages() {
  const now = new Date();
  
  // LOG DE DEPURAÇÃO: Verificando o tempo atual do servidor
  console.log(`[Worker][${now.toISOString()}] Verificando mensagens pendentes...`);

  // 1. Find pending messages that are due
  const messages = await prisma.scheduledMessage.findMany({
    where: {
      status: 'PENDING',
      scheduledAt: {
        lte: now // Menor ou igual a "agora"
      },
      OR: [
        { campaignId: null },
        { campaign: { status: 'RUNNING' } }
      ]
    },
    include: {
      tenant: true,
      campaign: true
    },
    orderBy: {
      scheduledAt: 'asc'
    }
  });

  // LOG DE DEPURAÇÃO: Mostrar quantas foram encontradas e o critério de tempo
  if (messages.length === 0) {
    // Vamos verificar se existe ALGUMA mensagem pendente, mesmo que seja para o futuro
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
      console.log(`[Worker] Nenhuma mensagem pronta para envio. Próxima mensagem pendente está agendada para: ${anyPending.scheduledAt.toISOString()}`);
    } else {
      console.log(`[Worker] Nenhuma mensagem pendente encontrada no banco.`);
    }
  } else {
    console.log(`[Worker] Encontradas ${messages.length} mensagens para enviar.`);
  }

  for (const msg of messages) {
    try {
      console.log(`[Worker] Enviando MSG ID: ${msg.id} | Agendada para: ${msg.scheduledAt.toISOString()}`);
      
      const { tenant } = msg;
      
      const headers: Record<string, string> = {
        'access-token': tenant.apiAccessToken, // FIXED: header name must be 'access-token'
        'client': tenant.client || '',
        'uid': tenant.uid || '',
      };

      let conversationId = msg.conversationId;

      if (!conversationId && msg.contactId && msg.inboxId) {
        console.log(`[Worker] Criando conversa para o contato ${msg.contactId}`);
        const createConvUrl = `${tenant.chatwootUrl}/api/v1/accounts/${tenant.accountId}/conversations`;
        
        try {
          // Usando fetchWithTimeout (15s limite)
          const convRes = await fetchWithTimeout(createConvUrl, {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              inbox_id: msg.inboxId,
              contact_id: String(msg.contactId),
              status: "open"
            })
          });

          if (!convRes.ok) {
             const errText = await convRes.text();
             throw new Error(`Failed to create conversation: ${convRes.status} - ${errText}`);
          }
          
          const convData = await convRes.json();
          conversationId = convData.id || (convData.payload && convData.payload.id);
          
          if (!conversationId) {
              throw new Error('Não foi possível obter o ID da conversa criada.');
          }

          await prisma.scheduledMessage.update({
            where: { id: msg.id },
            data: { conversationId }
          });
        } catch (convErr) {
            console.error(`[Worker] Erro ao criar conversa:`, convErr);
            throw convErr; // Interrompe e vai pro catch principal do loop
        }
      }

      if (!conversationId) {
         throw new Error('Sem conversationId e sem dados para criar uma nova.');
      }

      const url = `${tenant.chatwootUrl}/api/v1/accounts/${tenant.accountId}/conversations/${conversationId}/messages`;
      
      let body: string | FormData;

      if (msg.attachmentUrl) {
        // Prepare FormData for attachment
        const attachmentRes = await fetchWithTimeout(msg.attachmentUrl);
        if (!attachmentRes.ok) throw new Error(`Failed to fetch attachment: ${attachmentRes.statusText}`);
        const blob = await attachmentRes.blob();
        
        const formData = new FormData();
        formData.append('content', msg.content);
        formData.append('message_type', 'outgoing');
        formData.append('private', 'false');
        formData.append('attachments[]', blob, 'file'); // 'file' name is arbitrary but needed
        
        body = formData;
        // Do NOT set Content-Type header manually for FormData
      } else {
        // Send as JSON
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({
          content: msg.content,
          message_type: 'outgoing', 
          private: false 
        });
      }
      
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers,
        body
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Chatwoot API Error: ${response.status} - ${errText}`);
      }

      await prisma.scheduledMessage.update({
        where: { id: msg.id },
        data: { status: 'SENT', errorLog: null }
      });

      if (msg.campaignId) {
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
        } else {
          // Check if 50 contacts were sent today
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
      
      console.log(`[Worker] Mensagem ${msg.id} enviada com sucesso.`);

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
    console.error('[Worker] Erro no loop de intervalo:', err);
  } finally {
    // Agenda para daqui a 10s APÓS o ciclo atual (sucesso ou falha) terminar
    setTimeout(runWorkerLoop, 10000);
  }
}

async function startWorker() {
  // Garantir que o log de início apareça
  console.log('==============================================');
  console.log('[Worker] Iniciando loop de varredura...');
  console.log(`[Worker] Hora atual do servidor: ${new Date().toISOString()}`);
  console.log('==============================================');
  
  // Inicia o processo recursivo que aguarda a conclusão antes de reiniciar
  runWorkerLoop();
}

// Inicia o processo
startWorker();