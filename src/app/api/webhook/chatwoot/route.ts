import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import Redis from 'ioredis';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import axios from 'axios';

// Singleton Redis client for serverless environment
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// --- Helper Functions ---

// Conta Tokens
function calculateTokenCost(promptTokens: number, completionTokens: number, model: string = 'gpt-4o-mini') {
  // Preços aproximados por 1M tokens (Junho 2024 pricing)
  // Mini: $0.150 per 1M input, $0.600 per 1M output
  // 4o:   $5.00  per 1M input, $15.00 per 1M output
  let inputCostPerM = 0;
  let outputCostPerM = 0;
  
  if (model === 'gpt-4o-mini') {
    inputCostPerM = 0.15;
    outputCostPerM = 0.60;
  } else if (model === 'gpt-4o') {
    inputCostPerM = 5.00;
    outputCostPerM = 15.00;
  }

  const cost = (promptTokens * (inputCostPerM / 1000000)) + (completionTokens * (outputCostPerM / 1000000));
  return cost;
}

// Interage com o Chatwoot enviando Mensagem
async function sendChatwootMessage(chatwootUrl: string, accountId: number, conversationId: number, token: string, content: string, audioBuffer?: Buffer) {
  const url = `${chatwootUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;
  
  if (audioBuffer) {
    const formData = new FormData();
    formData.append('content', "Áudio Gerado pela IA");
    formData.append('message_type', 'outgoing');
    formData.append('private', 'false');
    
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/mpeg' });
    formData.append('attachments[]', blob, 'audio-resposta.mp3');

    await fetch(url, {
      method: 'POST',
      headers: { 'api_access_token': token },
      body: formData
    });
  } else {
    await axios.post(url, {
      content: content,
      message_type: 'outgoing',
      private: false
    }, {
      headers: { 'api_access_token': token }
    });
  }
}

// Pega histórico da conversa (apenas textos) do Chatwoot
async function getChatwootHistory(chatwootUrl: string, accountId: number, conversationId: number, token: string) {
  const url = `${chatwootUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;
  try {
    const res = await axios.get(url, { headers: { 'api_access_token': token }});
    // Messages vem do Chatwoot do mais novo pro mais antigo na API, precisa reverter
    const messages = res.data.payload || [];
    const ordered = messages.reverse();

    return ordered.filter((m: any) => !m.private && (m.message_type === 0 || m.message_type === 1 || m.message_type === 2)).map((m: any) => {
      // 0 = Incoming, 1 = Outgoing, 2 = Template
      const role = m.message_type === 0 ? 'user' : 'assistant';
      return { role, content: m.content || '[Sem Texto / Mídia]' };
    }).slice(-15); // Pega as ultimas 15 iteracoes para context window
  } catch (error) {
    console.error("[Webhook IA] Erro ao buscar histórico", error);
    return [];
  }
}

// Aplica label na conversa (ex: passar pra vendedora)
async function addLabelToConversation(chatwootUrl: string, accountId: number, conversationId: number, token: string, label: string) {
  try {
    const url = `${chatwootUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`;
    
    // Pegar labels existentes
    const convUrl = `${chatwootUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}`;
    const getRes = await axios.get(convUrl, { headers: { 'api_access_token': token }});
    let currentLabels = getRes.data.payload?.labels || [];
    currentLabels.push(label);

    await axios.post(url, { labels: currentLabels }, { headers: { 'api_access_token': token }});
  } catch (err) {
    console.error("Erro adicionando label", err);
  }
}

// Função ElevenLabs TTS
async function generateAudio(text: string, apiKey: string, voiceId: string): Promise<Buffer | null> {
  try {
    const response = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    }, {
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer'
    });
    return Buffer.from(response.data);
  } catch (err: any) {
    console.error("[ElevenLabs] Erro ao gerar áudio:", err?.response?.data || err.message);
    return null;
  }
}


// --- Ferramentas (Tools) equivalentes ao que a Lola N8N fazia ---
// O sistema do Chatwoot Wrapper não tem n8n, então ele executa as "tools" no Node
const toolsDef = [
  {
    type: "function",
    function: {
      name: "salvar_lead",
      description: "Salva os dados do cliente (idade, gosto, observações) no CRM para manter histórico.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string" },
          cidade: { type: "string" },
          observacao: { type: "string", description: "O que ele gosta de comprar, se é varejo ou atacado" }
        },
        required: ["nome"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "enviar_catalogo",
      description: "Dispara envio do catálogo para o cliente quando ele pede. Sempre responda avisando que enviou depois de chamar essa tool."
    }
  },
  {
    type: "function",
    function: {
      name: "passar_vendedora",
      description: "Transfere o atendimento para uma humana se a pessoa quiser comprar algo específico, pagar ou falar com humano."
    }
  }
];

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    // Filtros Iniciais: Só responder mensagens recém criadas de clientes (tipo INCOMING)
    if (payload.event !== 'message_created') {
      return NextResponse.json({ success: true, message: 'Ignorado evento != message_created' });
    }
    
    // Ignora mensagens enviadas pela própria IA ou agentes (message_type 1 ou 2)
    if (payload.message_type !== 'incoming' && payload.message_type !== 0) {
      return NextResponse.json({ success: true, message: 'Ignorado mensagem outgoing' });
    }

    // Ignora private notes
    if (payload.private) {
      return NextResponse.json({ success: true, message: 'Ignorado nota privada' });
    }

    const accountId = payload.account?.id;
    const conversationId = payload.conversation?.id;
    const inboxId = payload.inbox?.id;
    
    if (!accountId || !conversationId) {
      return NextResponse.json({ success: false, message: 'Invalid payload' });
    }

    // Verifica Labels da conversa (se tem "ia_não_responde" ou "suporte_ativo", etc)
    const conversationLabels = payload.conversation?.labels || [];
    if (conversationLabels.includes('ia_não_responde')) {
       return NextResponse.json({ success: true, message: 'Conversa ignorada por label (ia_não_responde)' });
    }

    // Achar o Tenant e o Agent
    const tenant = await prisma.tenant.findFirst({
      where: { accountId: parseInt(accountId) },
      include: { aiAgent: true }
    });

    if (!tenant || !tenant.aiAgent || !tenant.aiAgent.isActive) {
      return NextResponse.json({ success: true, message: 'IA não ativa neste tenant' });
    }

    const agent = tenant.aiAgent;
    
    // Verifica se a inbox acionada pelo Webhook está permitida na lista de Inboxes
    if (inboxId && agent.inboxIds && agent.inboxIds.length > 0) {
      if (!agent.inboxIds.includes(inboxId)) {
         return NextResponse.json({ success: true, message: 'Conversa ignorada. Caixa de entrada não monitorada pela IA.' });
      }
    }

    if (!agent.openAiKey) {
      return NextResponse.json({ success: true, message: 'IA ativa mas sem Api Key' });
    }

    // --- Mecanismo Anti-Encavalo (DEBOUNCING) ---
    // O usuário manda 4 áudios e 3 mensagens. Queremos responder só depois de 5 segundos de silêncio.
    const lockKey = `ia_debounce_${conversationId}`;
    
    // Renova o timer no Redis para dar +10 segundos de lock virtual
    await redis.set(lockKey, 'waiting', 'EX', 8);

    // Espera os mesmos 8.5 segundos 
    await new Promise(resolve => setTimeout(resolve, 8500));

    // Depois de 8.5seg, verifica: O Redis expirou (nós fomos a última mensagem a resetar) 
    // ou ainda existe (alguém mais renovou depois da gente)?
    const isLocked = await redis.get(lockKey);
    if (isLocked) {
      // Outro request subsequente já sobrescreveu o Lock e vai processar a mensagem final
      return NextResponse.json({ success: true, message: 'Encavalo: deixando o request posterior responder.' });
    }

    console.log(`[Webhook IA] Iniciando resposta para conversa ${conversationId}`);

    // OK, somos o processo mestre que vai responder esta conversa agora.
    
    // Pegar o último hit de histórico 
    const history = await getChatwootHistory(tenant.chatwootUrl, tenant.accountId, conversationId, tenant.apiAccessToken);
    
    // TODO: Audio Transcription 
    // Se precisarmos processar o MP3 vindo do chatwoot, teríamos que baixar payload.attachments[0].data_url 
    // Para simplificar neste MVP, o prompt vai responder baseando no texto. 
    // Exigiria Whisper API aqui. Vamos confiar por enquanto que o cliente manda texto (ou o Evolution já transcreve pra gente).

    const messages = [];
    messages.push(new SystemMessage(agent.prompt || 'Você é um assistente útil.'));
    
    history.forEach((m: any) => {
       if (m.role === 'user') messages.push(new HumanMessage(m.content));
       else messages.push(new AIMessage(m.content));
    });

    const llm = new ChatOpenAI({
      openAIApiKey: agent.openAiKey,
      modelName: agent.modelName,
      temperature: agent.temperature
    });

    // Chamada à API com as tools
    // Cast "any" applied to avoid TS error on LangChain typing 
    const llmWithTools: any = (llm as any).bind({ tools: toolsDef as any });
    
    const response = await llmWithTools.invoke(messages);
    let finalAnswer = response.content;
    let tokensPrompt = response.response_metadata?.tokenUsage?.promptTokens || 0;
    let tokensCompletion = response.response_metadata?.tokenUsage?.completionTokens || 0;

    // Se ele chamar uma Tool (Function Calling)
    if (response.tool_calls && response.tool_calls.length > 0) {
      console.log(`[Webhook IA] Tool Called`, response.tool_calls[0].name);
      const toolC = response.tool_calls[0];

      if (toolC.name === 'passar_vendedora') {
         await addLabelToConversation(tenant.chatwootUrl, tenant.accountId, conversationId, tenant.apiAccessToken, 'ia_não_responde');
         finalAnswer = "Compreendido! Estou passando você para um de nossos especialistas humanos que já vai te atender.";
      } 
      else if (toolC.name === 'enviar_catalogo') {
         // Neste mockup, o envio de catálago é feito apenas mandando o link, ou uma tool paralela no Evolution.
         // Mas como foi o Bot que tomou a decisão:
         finalAnswer = "Estou enviando nosso catálogo completo no link a seguir: [LINK_AQUI] \n Tem algum modelo que chamou mais atenção?";
      } 
      else if (toolC.name === 'salvar_lead') {
         // Salvaria banco local, mas não precisamos de tool call de DB pra responder
         finalAnswer = "Estou salvando suas preferências aqui no nosso sistema...";
      }

      // Numa engrenagem madura, chamaríamos o agent devolvendo as respostas, aqui é simplificado
    }

    if (!finalAnswer) {
      finalAnswer = "Desculpe, tive um problema de comunicação interno.";
    }

    // Gerar Áudio (ElevenLabs TTS)?
    let audioBuffer = undefined;
    if (agent.elevenLabsApiKey && agent.elevenLabsVoiceId) {
      // Se a última msg do Cliente foi audío, a gente mandaria. Por não termos como ter absoluta certeza
      // devido ao Chatwoot não passar um flag simples às vezes, vamos assumir que mandará texto. 
      // Descomente / Adapte condicionalmente se `payload.attachments[0]?.file_type === 'audio'`
      
      const lastMsgIsAudio = payload.attachments?.some((a: any) => a.file_type && a.file_type.includes('audio'));
      if (lastMsgIsAudio) {
         const buff = await generateAudio(finalAnswer as string, agent.elevenLabsApiKey, agent.elevenLabsVoiceId);
         if (buff) audioBuffer = buff;
      }
    }

    // Enviar mensagem de volta pro Chatwoot
    await sendChatwootMessage(tenant.chatwootUrl, tenant.accountId, conversationId, tenant.apiAccessToken, finalAnswer as string, audioBuffer);

    // Salvar Custos no DB
    const cost = calculateTokenCost(tokensPrompt, tokensCompletion, agent.modelName);
    await prisma.tokenUsage.create({
      data: {
        tenantId: tenant.id,
        conversationId: conversationId,
        promptTokens: tokensPrompt,
        completionTokens: tokensCompletion,
        totalCost: cost
      }
    });

    return NextResponse.json({ success: true, answer: finalAnswer });

  } catch (error) {
    console.error("[Webhook IA] Erro Fatal:", error);
    return NextResponse.json({ error: 'Internet Server Error processing webhook' }, { status: 500 });
  }
}
