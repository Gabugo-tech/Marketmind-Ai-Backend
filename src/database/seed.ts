/**
 * MarketMind AI — Demo Seed Data
 * Business: Anambra Electronics Hub, Onitsha
 *
 * Creates realistic historical data for demonstration purposes.
 * Clearly marked as DEMO DATA — not real trader transactions.
 */

import { PrismaClient, BusinessCategory, PaymentMethod, MovementType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { subDays, addHours, format } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding MarketMind AI demo data...\n');

  // Clean existing demo data
  await prisma.aIConversationMessage.deleteMany({});
  await prisma.aIConversation.deleteMany({});
  await prisma.forecast.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.inventoryMovement.deleteMany({});
  await prisma.saleItem.deleteMany({});
  await prisma.sale.deleteMany({});
  await prisma.purchaseItem.deleteMany({});
  await prisma.purchase.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.productCategory.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.businessSettings.deleteMany({});
  await prisma.business.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('✅ Cleaned existing data');

  // ── Create demo user ──────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Demo1234!', 12);
  const user = await prisma.user.create({
    data: {
      email: 'demo@marketmind.ai',
      passwordHash,
      firstName: 'Chukwuemeka',
      lastName: 'Okafor',
      phone: '+2348012345678',
      isEmailVerified: true,
    },
  });
  console.log(`✅ Created demo user: ${user.email}`);

  // ── Create business ───────────────────────────────────────────────────────
  const business = await prisma.business.create({
    data: {
      userId: user.id,
      name: 'Anambra Electronics Hub',
      description: 'Your trusted electronics and gadgets dealer in Onitsha Main Market',
      category: BusinessCategory.ELECTRONICS,
      location: 'Onitsha, Anambra State',
      address: 'Shop 42, Oguta Road Plaza, Onitsha Main Market',
      phone: '+2348023456789',
      email: 'info@anambraelectronics.ng',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      isDemo: true,
      settings: {
        create: {
          lowStockThreshold: 10,
          criticalStockThreshold: 5,
          defaultSupplierLeadDays: 3,
          allowNegativeInventory: false,
        },
      },
    },
  });
  console.log(`✅ Created business: ${business.name}`);

  // ── Create categories ─────────────────────────────────────────────────────
  const categories = await Promise.all([
    prisma.productCategory.create({ data: { businessId: business.id, name: 'Smartphones & Tablets', color: '#3B82F6' } }),
    prisma.productCategory.create({ data: { businessId: business.id, name: 'Audio & Earphones', color: '#10B981' } }),
    prisma.productCategory.create({ data: { businessId: business.id, name: 'Accessories & Cables', color: '#F59E0B' } }),
    prisma.productCategory.create({ data: { businessId: business.id, name: 'Power & Batteries', color: '#EF4444' } }),
    prisma.productCategory.create({ data: { businessId: business.id, name: 'Laptops & Computers', color: '#8B5CF6' } }),
  ]);
  console.log(`✅ Created ${categories.length} categories`);

  const [catSmartphones, catAudio, catAccessories, catPower, catLaptops] = categories;

  // ── Create suppliers ──────────────────────────────────────────────────────
  const [supplier1, supplier2, supplier3] = await Promise.all([
    prisma.supplier.create({
      data: {
        businessId: business.id,
        name: 'Lagos Tech Wholesale',
        contactName: 'Bello Musa',
        phone: '+2348045678901',
        email: 'wholesale@lagostech.ng',
        address: 'Computer Village, Ikeja, Lagos',
        leadTimeDays: 2,
      },
    }),
    prisma.supplier.create({
      data: {
        businessId: business.id,
        name: 'Aba Electronics Market',
        contactName: 'Sunday Eze',
        phone: '+2348056789012',
        address: 'Ariaria Market, Aba, Abia State',
        leadTimeDays: 1,
      },
    }),
    prisma.supplier.create({
      data: {
        businessId: business.id,
        name: 'Alaba International',
        contactName: 'Rasheed Adewale',
        phone: '+2348067890123',
        address: 'Alaba International Market, Lagos',
        leadTimeDays: 3,
      },
    }),
  ]);
  console.log(`✅ Created 3 suppliers`);

  // ── Create products ───────────────────────────────────────────────────────
  const productsData = [
    // Smartphones
    { name: 'Samsung Galaxy A14', sku: 'SAM-A14-01', categoryId: catSmartphones.id, supplierId: supplier1.id, purchasePrice: 68000, sellingPrice: 85000, quantity: 15, minStockLevel: 5 },
    { name: 'Tecno Spark 20', sku: 'TEC-SP20-01', categoryId: catSmartphones.id, supplierId: supplier2.id, purchasePrice: 55000, sellingPrice: 69000, quantity: 22, minStockLevel: 8 },
    { name: 'Infinix Hot 40', sku: 'INF-H40-01', categoryId: catSmartphones.id, supplierId: supplier2.id, purchasePrice: 62000, sellingPrice: 78000, quantity: 18, minStockLevel: 6 },
    { name: 'iPhone 11 (UK Used)', sku: 'APL-IP11-UK', categoryId: catSmartphones.id, supplierId: supplier3.id, purchasePrice: 155000, sellingPrice: 195000, quantity: 7, minStockLevel: 3 },
    { name: 'Samsung A54 5G', sku: 'SAM-A54-5G', categoryId: catSmartphones.id, supplierId: supplier1.id, purchasePrice: 195000, sellingPrice: 240000, quantity: 4, minStockLevel: 3 },
    // Audio
    { name: 'Samsung USB-C Earphones', sku: 'SAM-EAR-C01', categoryId: catAudio.id, supplierId: supplier1.id, purchasePrice: 1800, sellingPrice: 3500, quantity: 85, minStockLevel: 20 },
    { name: 'Oraimo Wireless Earbuds', sku: 'ORA-EAR-W01', categoryId: catAudio.id, supplierId: supplier2.id, purchasePrice: 4500, sellingPrice: 7500, quantity: 32, minStockLevel: 15 },
    { name: 'JBL Clip 4 Speaker', sku: 'JBL-CLP4-01', categoryId: catAudio.id, supplierId: supplier3.id, purchasePrice: 18000, sellingPrice: 26000, quantity: 8, minStockLevel: 4 },
    { name: 'Generic 3.5mm Earphones', sku: 'GEN-EAR-01', categoryId: catAudio.id, supplierId: supplier2.id, purchasePrice: 500, sellingPrice: 1200, quantity: 150, minStockLevel: 50 },
    // Accessories
    { name: 'USB-C Charging Cable 1m', sku: 'CAB-USBC-1M', categoryId: catAccessories.id, supplierId: supplier2.id, purchasePrice: 600, sellingPrice: 1500, quantity: 200, minStockLevel: 60 },
    { name: 'iPhone Lightning Cable 1m', sku: 'CAB-LIG-1M', categoryId: catAccessories.id, supplierId: supplier2.id, purchasePrice: 800, sellingPrice: 2000, quantity: 120, minStockLevel: 40 },
    { name: 'Samsung 25W Fast Charger', sku: 'SAM-CHG-25W', categoryId: catAccessories.id, supplierId: supplier1.id, purchasePrice: 3500, sellingPrice: 6500, quantity: 45, minStockLevel: 15 },
    { name: 'Phone Screen Protector (Universal)', sku: 'ACC-SPR-UNI', categoryId: catAccessories.id, supplierId: supplier2.id, purchasePrice: 300, sellingPrice: 800, quantity: 300, minStockLevel: 80 },
    { name: 'Phone Case (Tecno/Infinix Universal)', sku: 'ACC-CAS-TI', categoryId: catAccessories.id, supplierId: supplier2.id, purchasePrice: 500, sellingPrice: 1200, quantity: 180, minStockLevel: 50 },
    // Power
    { name: 'Oraimo 20000mAh Power Bank', sku: 'ORA-PB-20K', categoryId: catPower.id, supplierId: supplier2.id, purchasePrice: 9500, sellingPrice: 15000, quantity: 24, minStockLevel: 8 },
    { name: 'Baseus 10000mAh Power Bank', sku: 'BAS-PB-10K', categoryId: catPower.id, supplierId: supplier3.id, purchasePrice: 7000, sellingPrice: 11500, quantity: 18, minStockLevel: 6 },
    { name: 'AA Alkaline Batteries (Pack 4)', sku: 'BAT-AA-PK4', categoryId: catPower.id, supplierId: supplier2.id, purchasePrice: 400, sellingPrice: 900, quantity: 400, minStockLevel: 100 },
    // Low/critical stock items for demo
    { name: 'Samsung Galaxy Buds2', sku: 'SAM-BUD2-01', categoryId: catAudio.id, supplierId: supplier1.id, purchasePrice: 28000, sellingPrice: 38000, quantity: 3, minStockLevel: 5 },
    { name: 'MacBook Air M1 (Used)', sku: 'APL-MBA-M1', categoryId: catLaptops.id, supplierId: supplier3.id, purchasePrice: 480000, sellingPrice: 580000, quantity: 2, minStockLevel: 2 },
    { name: 'USB Hub 4-Port', sku: 'ACC-USB-HUB', categoryId: catAccessories.id, supplierId: supplier2.id, purchasePrice: 2000, sellingPrice: 4000, quantity: 0, minStockLevel: 10 },
  ];

  const products = await Promise.all(
    productsData.map((p) =>
      prisma.product.create({
        data: {
          businessId: business.id,
          name: p.name,
          sku: p.sku,
          categoryId: p.categoryId,
          supplierId: p.supplierId,
          purchasePrice: p.purchasePrice,
          sellingPrice: p.sellingPrice,
          quantity: p.quantity,
          minStockLevel: p.minStockLevel,
          unit: 'unit',
        },
      })
    )
  );
  console.log(`✅ Created ${products.length} products`);

  // Record opening stock movements
  for (const p of products) {
    if (p.quantity > 0) {
      await prisma.inventoryMovement.create({
        data: {
          businessId: business.id,
          productId: p.id,
          type: MovementType.OPENING_STOCK,
          quantity: p.quantity,
          quantityBefore: 0,
          quantityAfter: p.quantity,
          notes: 'Opening stock (demo)',
          createdAt: subDays(new Date(), 90),
        },
      });
    }
  }

  // ── Generate 90 days of historical sales ─────────────────────────────────
  console.log('📊 Generating 90 days of realistic sales history...');

  const productMap = new Map(products.map((p) => [p.sku!, p]));

  // Sales patterns: products with realistic daily demand
  // Higher demand items sell more frequently
  const salesPatterns = [
    { sku: 'GEN-EAR-01', avgDaily: 8, variance: 4 },
    { sku: 'CAB-USBC-1M', avgDaily: 12, variance: 5 },
    { sku: 'CAB-LIG-1M', avgDaily: 7, variance: 3 },
    { sku: 'ACC-SPR-UNI', avgDaily: 10, variance: 4 },
    { sku: 'ACC-CAS-TI', avgDaily: 8, variance: 3 },
    { sku: 'BAT-AA-PK4', avgDaily: 5, variance: 3 },
    { sku: 'SAM-EAR-C01', avgDaily: 5, variance: 2 },
    { sku: 'ORA-EAR-W01', avgDaily: 3, variance: 2 },
    { sku: 'SAM-CHG-25W', avgDaily: 3, variance: 2 },
    { sku: 'ORA-PB-20K', avgDaily: 2, variance: 1 },
    { sku: 'BAS-PB-10K', avgDaily: 2, variance: 1 },
    { sku: 'TEC-SP20-01', avgDaily: 2, variance: 1 },
    { sku: 'INF-H40-01', avgDaily: 1.5, variance: 1 },
    { sku: 'SAM-A14-01', avgDaily: 1, variance: 1 },
    { sku: 'JBL-CLP4-01', avgDaily: 0.8, variance: 0.5 },
    { sku: 'APL-IP11-UK', avgDaily: 0.5, variance: 0.3 },
    { sku: 'SAM-A54-5G', avgDaily: 0.3, variance: 0.2 },
  ];

  const paymentMethods = [PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.POS, PaymentMethod.BANK_TRANSFER];

  let saleCount = 0;
  let refNum = 10000;

  for (let dayOffset = 89; dayOffset >= 0; dayOffset--) {
    const saleDate = subDays(new Date(), dayOffset);

    // 2–5 sales transactions per day
    const txPerDay = 2 + Math.floor(Math.random() * 4);

    for (let tx = 0; tx < txPerDay; tx++) {
      // Pick 1–3 products for this transaction
      const numItems = 1 + Math.floor(Math.random() * 3);
      const selectedPatterns = [...salesPatterns]
        .sort(() => Math.random() - 0.5)
        .slice(0, numItems);

      const items: Array<{
        productId: string;
        productName: string;
        quantity: number;
        unitPrice: number;
        purchasePrice: number;
        lineTotal: number;
        profit: number;
      }> = [];
      let subtotal = 0;
      let cogTotal = 0;

      for (const pattern of selectedPatterns) {
        const product = productMap.get(pattern.sku);
        if (!product) continue;

        const qty = Math.max(1, Math.round(
          pattern.avgDaily / txPerDay + (Math.random() - 0.5) * pattern.variance
        ));

        const unitPrice = Number(product.sellingPrice);
        const purchasePrice = Number(product.purchasePrice);
        const lineTotal = unitPrice * qty;
        const profit = (unitPrice - purchasePrice) * qty;

        subtotal += lineTotal;
        cogTotal += purchasePrice * qty;
        items.push({
          productId: product.id,
          productName: product.name,
          quantity: qty,
          unitPrice,
          purchasePrice,
          lineTotal,
          profit,
        });
      }

      if (items.length === 0) continue;

      const saleTime = addHours(saleDate, 8 + Math.floor(Math.random() * 10));
      const payMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];

      await prisma.sale.create({
        data: {
          businessId: business.id,
          referenceNumber: `SAL-DEMO-${refNum++}`,
          subtotal,
          discountAmount: 0,
          taxAmount: 0,
          total: subtotal,
          costOfGoods: cogTotal,
          grossProfit: subtotal - cogTotal,
          paymentMethod: payMethod,
          paymentStatus: 'PAID',
          status: 'COMPLETED',
          soldAt: saleTime,
          createdAt: saleTime,
          items: {
            create: items.map((i) => ({
              productId: i.productId,
              productName: i.productName,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              purchasePrice: i.purchasePrice,
              discountAmount: 0,
              lineTotal: i.lineTotal,
              profit: i.profit,
            })),
          },
        },
      });
      saleCount++;
    }
  }
  console.log(`✅ Created ${saleCount} sales transactions across 90 days`);

  // ── Create notifications ───────────────────────────────────────────────────
  const outOfStock = products.find((p) => p.quantity === 0);
  const criticalStock = products.find((p) => p.quantity > 0 && p.quantity <= p.minStockLevel / 2);
  const lowStock = products.filter((p) => p.quantity > 0 && p.quantity <= p.minStockLevel);

  if (outOfStock) {
    await prisma.notification.create({
      data: {
        businessId: business.id,
        type: 'OUT_OF_STOCK',
        title: 'Out of Stock Alert',
        message: `${outOfStock.name} is completely out of stock. Restock immediately.`,
        priority: 'URGENT',
        data: { productId: outOfStock.id, productName: outOfStock.name },
      },
    });
  }

  if (criticalStock) {
    await prisma.notification.create({
      data: {
        businessId: business.id,
        type: 'CRITICAL_STOCK',
        title: 'Critical Stock Level',
        message: `${criticalStock.name} has only ${criticalStock.quantity} units left.`,
        priority: 'HIGH',
        data: { productId: criticalStock.id, productName: criticalStock.name },
      },
    });
  }

  for (const p of lowStock.slice(0, 3)) {
    await prisma.notification.create({
      data: {
        businessId: business.id,
        type: 'LOW_STOCK',
        title: 'Low Stock Warning',
        message: `${p.name} is running low with ${p.quantity} units remaining.`,
        priority: 'MEDIUM',
        data: { productId: p.id, productName: p.name, quantity: p.quantity },
      },
    });
  }

  console.log(`✅ Created stock notifications`);

  console.log(`
╔════════════════════════════════════════════════════════════╗
║           MarketMind AI — Demo Data Seeded!                ║
╠════════════════════════════════════════════════════════════╣
║  Business:  Anambra Electronics Hub, Onitsha               ║
║  Demo Login: demo@marketmind.ai                            ║
║  Password:   Demo1234!                                     ║
║  Products:   ${products.length} products seeded                         ║
║  Sales:      ${saleCount} transactions (90 days history)         ║
║                                                            ║
║  ⚠️  This is DEMO DATA for hackathon demonstration         ║
║      Not real trader transactions                          ║
╚════════════════════════════════════════════════════════════╝
  `);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
