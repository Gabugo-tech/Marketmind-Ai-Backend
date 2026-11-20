/**
 * MarketMind AI — Gemini-Powered Business Assistant
 * Uses direct REST API to support both AIza and AQ. key formats
 */

import { prisma } from '../database/client';
import { config } from '../config';
import { subDays, format, startOfMonth, endOfMonth, startOfDay } from 'date-fns';

// Direct REST API call to Groq (free, no credit card, OpenAI-compatible)
async function callGemini(prompt: string, history: { role: string; text: string }[]): Promise<string> {
  const apiKey = config.gemini.apiKey;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const messages = [
    ...history.map(h => ({ role: h.role === 'model' ? 'assistant' : h.role, content: h.text })),
    { role: 'user', content: prompt },
  ];

  // llama-3.1-8b-instant: 30 req/min free tier — much higher limit than large models
  const MODELS = [
    'llama-3.1-8b-instant',
    'llama3-8b-8192',
    'gemma2-9b-it',
  ];

  let lastError = '';
  for (const model of MODELS) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1024,
        temperature: 0.4,
      }),
    });

    if (response.status === 429) {
      // Rate limited on this model — try next
      lastError = '429';
      continue;
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "I couldn't generate a response.";
  }

  // All models rate-limited
  throw new Error(`rate_limit_${lastError}`);
}

async function buildBusinessContext(businessId: string): Promise<string> {
  const now = new Date();
  const today = startOfDay(now);
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subDays(monthStart, 1));
  const lastMonthEnd = endOfMonth(subDays(monthStart, 1));
  const since7 = subDays(now, 7);
  const since30 = subDays(now, 30);

  const [business, thisMonthSales, lastMonthSales, todaySales, thisWeekSales,
    topProducts, lowStockProducts, outOfStockProducts, recentTransactions, totalProducts] =
    await Promise.all([
      prisma.business.findUnique({ where: { id: businessId }, select: { name: true, category: true, location: true, currency: true } }),
      prisma.sale.aggregate({ where: { businessId, status: 'COMPLETED', soldAt: { gte: monthStart, lte: monthEnd } }, _sum: { total: true, grossProfit: true }, _count: { id: true } }),
      prisma.sale.aggregate({ where: { businessId, status: 'COMPLETED', soldAt: { gte: lastMonthStart, lte: lastMonthEnd } }, _sum: { total: true, grossProfit: true }, _count: { id: true } }),
      prisma.sale.aggregate({ where: { businessId, status: 'COMPLETED', soldAt: { gte: today } }, _sum: { total: true, grossProfit: true }, _count: { id: true } }),
      prisma.sale.aggregate({ where: { businessId, status: 'COMPLETED', soldAt: { gte: since7 } }, _sum: { total: true, grossProfit: true }, _count: { id: true } }),
      prisma.saleItem.groupBy({ by: ['productId', 'productName'], where: { sale: { businessId, status: 'COMPLETED', soldAt: { gte: since30 } } }, _sum: { quantity: true, lineTotal: true, profit: true }, orderBy: { _sum: { lineTotal: 'desc' } }, take: 10 }),
      prisma.product.findMany({ where: { businessId, isActive: true, quantity: { gt: 0 } }, select: { name: true, quantity: true, minStockLevel: true }, orderBy: { quantity: 'asc' }, take: 10 }),
      prisma.product.findMany({ where: { businessId, isActive: true, quantity: { lte: 0 } }, select: { name: true }, take: 10 }),
      prisma.sale.findMany({ where: { businessId, status: 'COMPLETED' }, select: { referenceNumber: true, total: true, grossProfit: true, soldAt: true, items: { select: { productName: true, quantity: true } } }, orderBy: { soldAt: 'desc' }, take: 5 }),
      prisma.product.count({ where: { businessId, isActive: true } }),
    ]);

  const lowStock = lowStockProducts.filter(p => p.quantity > 0 && p.quantity <= p.minStockLevel);

  return `BUSINESS CONTEXT (${format(now, 'dd MMM yyyy, HH:mm')} WAT)
Business: ${business?.name ?? 'Unknown'} | ${business?.category ?? ''} | ${business?.location ?? ''}

TODAY: Revenue ₦${Number(todaySales._sum.total ?? 0).toLocaleString()} | Profit ₦${Number(todaySales._sum.grossProfit ?? 0).toLocaleString()} | ${todaySales._count.id} transactions
THIS WEEK: Revenue ₦${Number(thisWeekSales._sum.total ?? 0).toLocaleString()} | Profit ₦${Number(thisWeekSales._sum.grossProfit ?? 0).toLocaleString()} | ${thisWeekSales._count.id} transactions
THIS MONTH (${format(monthStart, 'MMM yyyy')}): Revenue ₦${Number(thisMonthSales._sum.total ?? 0).toLocaleString()} | Profit ₦${Number(thisMonthSales._sum.grossProfit ?? 0).toLocaleString()} | ${thisMonthSales._count.id} transactions
LAST MONTH (${format(lastMonthStart, 'MMM yyyy')}): Revenue ₦${Number(lastMonthSales._sum.total ?? 0).toLocaleString()} | Profit ₦${Number(lastMonthSales._sum.grossProfit ?? 0).toLocaleString()} | ${lastMonthSales._count.id} transactions

INVENTORY: ${totalProducts} active products
OUT OF STOCK: ${outOfStockProducts.map(p => p.name).join(', ') || 'None'}
LOW STOCK: ${lowStock.map(p => `${p.name}(${p.quantity} left)`).join(', ') || 'None'}

TOP PRODUCTS (last 30 days):
${topProducts.map((p, i) => `${i + 1}. ${p.productName} — ${p._sum.quantity ?? 0} units, ₦${Number(p._sum.lineTotal ?? 0).toLocaleString()} revenue`).join('\n')}

RECENT SALES:
${recentTransactions.map(t => `- ${t.referenceNumber} | ${format(t.soldAt, 'dd MMM HH:mm')} | ₦${Number(t.total).toLocaleString()}`).join('\n')}`;
}

export async function chat(businessId: string, conversationId: string | null, userMessage: string): Promise<{ reply: string; conversationId: string }> {
  let conversation;
  if (conversationId) {
    conversation = await prisma.aIConversation.findFirst({
      where: { id: conversationId, businessId },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
    });
  }

  if (!conversation) {
    conversation = await prisma.aIConversation.create({
      data: { businessId, title: userMessage.slice(0, 60), messages: { create: [] } },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  await prisma.aIConversationMessage.create({
    data: { conversationId: conversation.id, role: 'USER', content: userMessage },
  });

  let reply: string;

  try {
    const businessContext = await buildBusinessContext(businessId);

    const systemPrompt = `You are MarketMind AI, an intelligent business assistant for traders in Onitsha, Anambra State, Nigeria.

You have access to this REAL, CURRENT business data:
${businessContext}

RULES:
1. Use ONLY the data above. Do NOT invent figures.
2. Quote exact amounts when answering financial questions.
3. Be concise. Use bullet points. Currency is ₦ (Nigerian Naira).
4. Give practical, actionable advice relevant to a Nigerian trader.
5. If a question requires data you don't have, say so honestly.`;

    // Build conversation history
    const history = conversation.messages.slice(-8).map(m => ({
      role: m.role === 'USER' ? 'user' : 'model',
      text: m.content,
    }));

    // Prepend system context as first user/model exchange
    const fullHistory = [
      { role: 'user', text: systemPrompt },
      { role: 'model', text: "Understood. I have your business data and I'm ready to help. What would you like to know?" },
      ...history,
    ];

    reply = await callGemini(userMessage, fullHistory);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Gemini error:', errMsg.slice(0, 300));

    if (errMsg.includes('API key not valid') || errMsg.includes('UNAUTHENTICATED') || errMsg.includes('invalid_api_key')) {
      reply = "⚠️ Invalid API key. Please update GEMINI_API_KEY in Railway with your Groq API key from https://console.groq.com";
    } else if (errMsg.includes('quota') || errMsg.includes('429') || errMsg.includes('rate_limit')) {
      reply = "⚠️ The AI is currently busy. Please wait 30 seconds and try again. This happens when many requests are made in a short time.";
    } else if (errMsg.includes('not found') || errMsg.includes('404') || errMsg.includes('model')) {
      reply = `⚠️ Model error: ${errMsg.slice(0, 150)}`;
    } else {
      reply = `⚠️ AI error: ${errMsg.slice(0, 150)}`;
    }
  }

  await prisma.aIConversationMessage.create({
    data: { conversationId: conversation.id, role: 'ASSISTANT', content: reply },
  });

  return { reply, conversationId: conversation.id };
}

export async function getConversations(businessId: string) {
  return prisma.aIConversation.findMany({
    where: { businessId },
    include: { _count: { select: { messages: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
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
