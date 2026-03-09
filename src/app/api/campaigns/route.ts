import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      name,
      label,
      inboxId,
      steps, // Agora será um array de etapas { type, content, delaySeconds }
      minDelay,
      maxDelay,
      chatwootUrl,
      accountId,
      token,
      client,
      uid
    } = body;

    if (!name || !label || !inboxId || !steps || !steps.length || minDelay == null || maxDelay == null || !chatwootUrl || !token) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    // Utilitário para Spintax de Texto (recursivo simples) {a|b|c}
    const parseSpintax = (text: string): string => {
      let result = text || "";
      const regex = /\{([^{}]+)\}/g;
      let match;
      while ((match = regex.exec(result)) !== null) {
        const options = match[1].split('|');
        const replacement = options[Math.floor(Math.random() * options.length)];
        result = result.substring(0, match.index) + replacement + result.substring(match.index + match[0].length);
        regex.lastIndex = 0; // Reinicia a regex para capturar aninhados ou os próximos
      }
      return result;
    };

    // Utilitário para mídias: pega URLs separadas por quebra de linha ou vírgulas e escolhe uma aleatória
    const parseMediaSpintax = (content: string): string | null => {
      if (!content) return null;
      const urls = content.split(/[\n,]+/).map(u => u.trim()).filter(Boolean);
      if (urls.length === 0) return null;
      return urls[Math.floor(Math.random() * urls.length)];
    };

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

    // 2. Buscar conversas com a etiqueta
    // O endpoint deve trazer as conversas do accountId filtradas pela tag.
    // Usando endpoint padrão do Chatwoot para buscar conversas e filtrando por label
    let allConversations: any[] = [];
    let page = 1;

    // TODO: Verify if the /conversations?labels= works for this chatwoot version or use general search
    const conversationsUrl = `${chatwootUrl}/api/v1/accounts/${accountId}/conversations?labels=${encodeURIComponent(label)}&status=all`;
    const conversationsRes = await fetch(conversationsUrl, {
      headers: {
        'access-token': token,
        'client': client || '',
        'uid': uid || ''
      }
    });

    if (!conversationsRes.ok) {
      const errText = await conversationsRes.text();
      console.error('Chatwoot error fetch conversations:', errText);
      throw new Error(`Falha ao buscar conversas: ${conversationsRes.status}`);
    }

    const conversationsData = await conversationsRes.json();
    let conversations = conversationsData.payload || conversationsData.data || conversationsData;
    
    // Tratativa para payload.conversations ou array direto
    if (conversationsData.data && conversationsData.data.payload) {
        conversations = conversationsData.data.payload;
    }

    if (!Array.isArray(conversations)) {
        conversations = [];
    }

    if (conversations.length === 0) {
      return NextResponse.json({ error: 'Nenhuma conversa encontrada com essa etiqueta' }, { status: 404 });
    }

    console.log(`Encontradas ${conversations.length} conversas para a etiqueta "${label}".`);

    // 4. Calcular os agendamentos respeitando o delay randômico e limite diário
    let lastTime = new Date();
    const maxPerDay = 50;
    const scheduledMessages = [];

    for (let i = 0; i < conversations.length; i++) {
        const conversation = conversations[i];

        // Strict Limit: Lote de 50 contatos por dia. Se ultrapassar, joga o "lastTime" para +24h
        if (i > 0 && i % maxPerDay === 0) {
            lastTime.setDate(lastTime.getDate() + 1);
        }

        // 1º Delay Randômico (Entre Contatos) 
        const randomDelayMinutes = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        lastTime = new Date(lastTime.getTime() + randomDelayMinutes * 60000);
        
        let currentStepTime = new Date(lastTime);

        // Processa cada etapa configurada para ESTE contato
        for (const step of steps) {
            // Conta o Delay individual dessa etapa (em segundos) - se não tiver, é 0 aguardando o próximo "tick" do worker
            currentStepTime = new Date(currentStepTime.getTime() + (step.delaySeconds || 0) * 1000);

            let spunContent = "";
            let attachmentUrl = null;

            if (step.type === 'text') {
               spunContent = parseSpintax(step.content);
            } else {
               // Para os outros (audio, image, document) usaremos o Array the URLs
               attachmentUrl = parseMediaSpintax(step.content);
            }

            scheduledMessages.push({
                content: spunContent,
                attachmentUrl: attachmentUrl || null,
                scheduledAt: new Date(currentStepTime),
                status: 'PENDING',
                tenantId: tenant.id,
                contactId: conversation.meta?.sender?.id || null, // fallback
                inboxId: conversation.inbox_id || Number(inboxId),
                conversationId: conversation.id,
            });
        }
    }

    // 3. Criar a Campanha com o Total de Mensagens (e não só de contatos, pro progresso não bugar)
    const campaign = await prisma.campaign.create({
      data: {
        name: name,
        tenantId: tenant.id,
        totalContacts: scheduledMessages.length, // Usamos quantity real para o worker preencher certinho
        status: 'RUNNING',
      }
    });

    // Assinar a CampaignId recém criada no Array final
    const finalMessages = scheduledMessages.map(msg => ({ ...msg, campaignId: campaign.id }));

    // Usando createMany para otimizar a inserção
    await prisma.scheduledMessage.createMany({
        data: finalMessages
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
