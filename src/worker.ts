
import prisma from './lib/prisma';

async function processScheduledMessages() {
  const now = new Date();
  
  // 1. Find pending messages that are due
  const messages = await prisma.scheduledMessage.findMany({
    where: {
      status: 'PENDING',
      scheduledAt: {
        lte: now
      }
    },
    include: {
      tenant: true
    }
  });

  if (messages.length > 0) {
    console.log(`[Worker] Found ${messages.length} messages to send.`);
  }

  for (const msg of messages) {
    try {
      console.log(`[Worker] Sending message ${msg.id} to Conversation ${msg.conversationId}...`);
      
      const { tenant } = msg;

      // 2. Send to Chatwoot
      // POST /api/v1/accounts/{accountId}/conversations/{conversationId}/messages
      const url = `${tenant.chatwootUrl}/api/v1/accounts/${tenant.accountId}/conversations/${msg.conversationId}/messages`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'api_access_token': tenant.apiAccessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: msg.content,
          message_type: 'outgoing', 
          private: false 
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Chatwoot API Error: ${response.status} - ${errText}`);
      }

      // 3. Mark as SENT
      await prisma.scheduledMessage.update({
        where: { id: msg.id },
        data: { status: 'SENT', errorLog: null }
      });
      
      console.log(`[Worker] Message ${msg.id} sent successfully.`);

    } catch (error: any) {
      console.error(`[Worker] Failed to send message ${msg.id}:`, error.message);
      
      // Mark as FAILED (or retry logic could go here)
      await prisma.scheduledMessage.update({
        where: { id: msg.id },
        data: { 
          status: 'FAILED',
          errorLog: String(error.message).slice(0, 1000)
        }
      });
    }
  }
}

async function startWorker() {
  console.log('[Worker] Starting polling loop...');
  
  // Run immediately then every 60 seconds
  await processScheduledMessages();

  setInterval(async () => {
    try {
      await processScheduledMessages();
    } catch (err) {
      console.error('[Worker] Error in loop:', err);
    }
  }, 60000); // Check every minute
}

startWorker();
