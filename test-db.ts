import 'dotenv/config';
import prisma from './src/lib/prisma';

async function main() {
  console.log("Conectando ao banco...");
  const messages = await prisma.scheduledMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { tenant: true }
  });
  console.log("Mensagens cadastradas:", JSON.stringify(messages, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    console.log("Desconectando...");
    await prisma.$disconnect();
  });
