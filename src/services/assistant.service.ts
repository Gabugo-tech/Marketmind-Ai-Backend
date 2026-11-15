/**
 * MarketMind AI — Gemini-Powered Business Assistant
 *
 * Security model:
 * - API key stays on the backend only
 * - Fetches only the minimum relevant business data before passing to Gemini
 * - Never exposes another trader's data
 * - Graceful fallback if Gemini is unavailable
 */

import { GoogleGenAI } from '@google/genai';
import { prisma } from '../database/client';
import { config } from '../config';
import { subDays, format, startOfMonth, endOfMonth, startOfDay } from 'date-fns';

// Lazy-init the Gemini client
let genAI: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!genAI) {
    if (!config.gemini.apiKey) throw new Error('GEMINI_API_KEY is not configured');
    genAI = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  }
  return genAI;
}

// ── Context builder — only minimum needed data ────────────────────────────────

async function buildBusinessContext(businessId: string): Promise<string> {
  const now = new Date();
  const today = startOfDay(now);
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subDays(monthStart, 1));
  const lastMonthEnd = endOfMonth(subDays(monthStart, 1));
  const since7 = subDays(now, 7);
  const since30 = subDays(now, 30);

  const [
    business,
    thisMonthSales,
    lastMonthSales,
    todaySales,
    thisWeekSales,
    topProducts,
    lowStockProducts,
    outOfStockProducts,
    recentTransactions,
    totalProducts,
  ] = await Promise.all([
    prisma.business.findUnique({
      where: { id: businessId },
      select: { name: true, category: true, location: true, currency: true },
    }),
    prisma.sale.aggregate({
      where: { businessId, status: 'COMPLETED', soldAt: { gte: monthStart, lte: monthEnd } },
      _sum: { total: true, grossProfit: true },
      _count: { id: true },
    }),
    prisma.sale.aggregate({
      where: { businessId, status: 'COMPLETED', soldAt: { gte: lastMonthStart, lte: lastMonthEnd } },
      _sum: { total: true, grossProfit: true },
      _count: { id: true },
    }),
    prisma.sale.aggregate({
      where: { businessId, status: 'COMPLETED', soldAt: { gte: today } },
      _sum: { total: true, grossProfit: true },
      _count: { id: true },
    }),
    prisma.sale.aggregate({
      where: { businessId, status: 'COMPLETED', soldAt: { gte: since7 } },
      _sum: { total: true, grossProfit: true },
      _count: { id: true },
    }),
    prisma.saleItem.groupBy({
      by: ['productId', 'productName'],
      where: { sale: { businessId, status: 'COMPLETED', soldAt: { gte: since30 } } },
      _sum: { quantity: true, lineTotal: true, profit: true },
      orderBy: { _sum: { lineTotal: 'desc' } },
      take: 10,
    }),
    prisma.product.findMany({
      where: {
        businessId, isActive: true,
        quantity: { gt: 0 },
      },
      select: { name: true, quantity: true, minStockLevel: true, sellingPrice: true },
      orderBy: { quantity: 'asc' },
      take: 10,
    }),
    prisma.product.findMany({
      where: { businessId, isActive: true, quantity: { lte: 0 } },
      select: { name: true },
      take: 10,
    }),
    prisma.sale.findMany({
      where: { businessId, status: 'COMPLETED' },
      select: { referenceNumber: true, total: true, grossProfit: true, soldAt: true, items: { select: { productName: true, quantity: true } } },
      orderBy: { soldAt: 'desc' },
      take: 5,
    }),
    prisma.product.count({ where: { businessId, isActive: true } }),
  ]);

  const lowStock = lowStockProducts.filter(
    (p) => p.quantity > 0 && p.quantity <= p.minStockLevel
  );

  const ctx = `
BUSINESS CONTEXT (as of ${format(now, 'dd MMM yyyy, HH:mm')} WAT)
Business: ${business?.name ?? 'Unknown'}
Category: ${business?.category ?? 'Unknown'}
Location: ${business?.location ?? 'Unknown'}
Currency: ${business?.currency ?? 'NGN'}

TODAY'S PERFORMANCE
- Sales revenue: ₦${Number(todaySales._sum.total ?? 0).toLocaleString()}
- Gross profit: ₦${Number(todaySales._sum.grossProfit ?? 0).toLocaleString()}
- Transactions: ${todaySales._count.id}

THIS WEEK (last 7 days)
- Sales revenue: ₦${Number(thisWeekSales._sum.total ?? 0).toLocaleString()}
- Gross profit: ₦${Number(thisWeekSales._sum.grossProfit ?? 0).toLocaleString()}
- Transactions: ${thisWeekSales._count.id}

THIS MONTH (${format(monthStart, 'MMM yyyy')})
- Sales revenue: ₦${Number(thisMonthSales._sum.total ?? 0).toLocaleString()}
- Gross profit: ₦${Number(thisMonthSales._sum.grossProfit ?? 0).toLocaleString()}
- Transactions: ${thisMonthSales._count.id}

LAST MONTH (${format(lastMonthStart, 'MMM yyyy')})
- Sales revenue: ₦${Number(lastMonthSales._sum.total ?? 0).toLocaleString()}
- Gross profit: ₦${Number(lastMonthSales._sum.grossProfit ?? 0).toLocaleString()}
- Transactions: ${lastMonthSales._count.id}

INVENTORY SUMMARY
- Total active products: ${totalProducts}
- Out of stock: ${outOfStockProducts.length} products (${outOfStockProducts.map((p) => p.name).join(', ') || 'None'})
- Low stock products: ${lowStock.length} products
${lowStock.map((p) => `  • ${p.name}: ${p.quantity} units (min: ${p.minStockLevel})`).join('\n')}

TOP 10 PRODUCTS (last 30 days by revenue)
${topProducts.map((p, i) => `${i + 1}. ${p.productName} — ${p._sum.quantity ?? 0} units sold, ₦${Number(p._sum.lineTotal ?? 0).toLocaleString()} revenue, ₦${Number(p._sum.profit ?? 0).toLocaleString()} profit`).join('\n')}

RECENT TRANSACTIONS (last 5)
${recentTransactions.map((t) => `- ${t.referenceNumber} | ${format(t.soldAt, 'dd MMM HH:mm')} | ₦${Number(t.total).toLocaleString()} | ${t.items.map((i) => `${i.productName}×${i.quantity}`).join(', ')}`).join('\n')}
`.trim();

  return ctx;
}

// ── Main chat function ─────────────────────────────────────────────────────────

export async function chat(
  businessId: string,
  conversationId: string | null,
  userMessage: string
): Promise<{ reply: string; conversationId: string }> {
  // Get or create conversation
  let conversation;
  if (conversationId) {
    conversation = await prisma.aIConversation.findFirst({
      where: { id: conversationId, businessId },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
    });
  }

  if (!conversation) {
    conversation = await prisma.aIConversation.create({
      data: {
        businessId,
        title: userMessage.slice(0, 60),
        messages: { create: [] },
      },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  // Store the user message
  await prisma.aIConversationMessage.create({
    data: { conversationId: conversation.id, role: 'USER', content: userMessage },
  });

  let reply: string;

  try {
    const client = getClient();

    // Build context from real business data
    const businessContext = await buildBusinessContext(businessId);

    const systemPrompt = `You are MarketMind AI, an intelligent business assistant for small and medium-sized traders in Onitsha, Anambra State, Nigeria.

You have access to the following REAL, CURRENT business data:

${businessContext}

IMPORTANT RULES:
1. Use ONLY the data provided above. Do NOT invent figures, percentages, or trends not present in the data.
2. When quoting financial figures, use the exact amounts from the data.
3. If you are estimating or inferring, clearly say so (e.g., "Based on current trends..." or "Approximately...").
4. Give practical, actionable advice relevant to a Nigerian trader.
5. Be concise and direct. Use bullet points for lists.
6. Currency is Nigerian Naira (₦). Always format with ₦ symbol.
7. If a question requires data you don't have (e.g., live market prices), say so honestly.
8. Keep responses friendly and professional. This trader is busy.`;

    // Build conversation history for multi-turn
    const historyMessages = conversation.messages
      .slice(-10)
      .map((m) => ({
        role: m.role === 'USER' ? 'user' as const : 'model' as const,
        parts: [{ text: m.content }],
      }));

    const chat = client.chats.create({
      model: 'gemini-1.5-flash-latest',
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 1024,
        temperature: 0.4,
      },
      history: historyMessages,
    });

    const result = await chat.sendMessage({ message: userMessage });
    reply = result.text ?? "I couldn't generate a response. Please try again.";
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Gemini error full:', errMsg);
    console.error('Gemini error stack:', error instanceof Error ? error.stack : '');

    if (errMsg.includes('API_KEY') || errMsg.includes('not configured')) {
      reply = "⚠️ The AI assistant is not configured yet. Please set your GEMINI_API_KEY in the backend environment variables.";
    } else if (errMsg.includes('API key not valid') || errMsg.includes('invalid') || errMsg.includes('401')) {
      reply = "⚠️ The Gemini API key is invalid. Please check the GEMINI_API_KEY in Railway environment variables.";
    } else if (errMsg.includes('quota') || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
      reply = "⚠️ Gemini API quota exceeded. Please wait a moment and try again.";
    } else {
      reply = `⚠️ AI service error: ${errMsg.slice(0, 100)}. Please try again.`;
    }
  }

  // Store assistant reply
  await prisma.aIConversationMessage.create({
    data: { conversationId: conversation.id, role: 'ASSISTANT', content: reply },
  });

  return { reply, conversationId: conversation.id };
}

export async function getConversations(businessId: string) {
  return prisma.aIConversation.findMany({
    where: { businessId },
    include: {
      _count: { select: { messages: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });
}

export async function getConversationMessages(businessId: string, conversationId: string) {
  const conv = await prisma.aIConversation.findFirst({
    where: { id: conversationId, businessId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!conv) return null;
  return conv.messages;
}
