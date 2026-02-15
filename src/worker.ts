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
      }
    },
    include: {
      tenant: true
    }
  });

  // LOG DE DEPURAÇÃO: Mostrar quantas foram encontradas e o critério de tempo
  if (messages.length === 0) {
    // Vamos verificar se existe ALGUMA mensagem pendente, mesmo que seja para o futuro
    const anyPending = await prisma.scheduledMessage.findFirst({
      where: { status: 'PENDING' },
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

      const url = `${tenant.chatwootUrl}/api/v1/accounts/${tenant.accountId}/conversations/${msg.conversationId}/messages`;
      
      let body: string | FormData;
      const headers: Record<string, string> = {
        'access-token': tenant.apiAccessToken, // FIXED: header name must be 'access-token'
        'client': tenant.client || '',
        'uid': tenant.uid || '',
      };

      if (msg.attachmentUrl) {
        // Prepare FormData for attachment
        const attachmentRes = await fetch(msg.attachmentUrl);
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
      
      const response = await fetch(url, {
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

async function startWorker() {
  // Garantir que o log de início apareça
  console.log('==============================================');
  console.log('[Worker] Iniciando loop de varredura...');
  console.log(`[Worker] Hora atual do servidor: ${new Date().toISOString()}`);
  console.log('==============================================');
  
  // Executa imediatamente
  await processScheduledMessages().catch(err => {
    console.error('[Worker] Erro crítico na execução inicial:', err);
  });

  // Agenda para cada 60 segundos
  setInterval(async () => {
    try {
      await processScheduledMessages();
    } catch (err) {
      console.error('[Worker] Erro no loop de intervalo:', err);
    }
  }, 60000);
}

// Inicia o processo
startWorker();