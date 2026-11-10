/**
 * Integration & Health-Check Test Script
 * Verifies all services (Database, Payments, UPI QR, Notifications)
 */
const db = require('../src/db/database');
const paymentService = require('../src/services/payment.service');
const notificationService = require('../src/services/notification.service');

async function runTestSuite() {
  console.log('🧪 Starting Backend Integration & Service Validation Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Database Init & Seeding
    console.log('[1/6] Testing Database Initialization & Recipients Seeding...');
    await db.init();
    const recipients = await db.getRecipients();
    assert(recipients && recipients.length >= 2, `Database has ${recipients ? recipients.length : 0} seeded recipients.`);
    assert(recipients[0].email === 'ravi123sehravat@gmail.com', 'Primary recipient is configured for ravi123sehravat@gmail.com.');

    // 2. Recipient Update
    console.log('\n[2/6] Testing Recipient Update...');
    const originalSecondary = recipients[1];
    const updated = await db.updateRecipient(originalSecondary.id, {
      name: 'Secondary Lead Updated'
    });
    assert(updated && updated.name === 'Secondary Lead Updated', 'Successfully updated recipient name.');

    // 3. NPCI UPI Dynamic QR Code Generation
    console.log('\n[3/6] Testing NPCI UPI Dynamic QR Code Generation (₹1.00)...');
    const upiRes = await paymentService.generateUpiQr({
      amount: 1.00,
      transactionNote: 'Test ₹1 UPI'
    });
    assert(upiRes.success === true, 'UPI QR generation succeeded.');
    assert(upiRes.upiUri.startsWith('upi://pay?'), `Valid NPCI UPI URI generated: ${upiRes.upiUri.substring(0, 45)}...`);
    assert(upiRes.qrCodeDataUrl.length > 50, 'QR Code image data URL generated.');
    assert(upiRes.amount === 1.00, 'UPI Amount is ₹1.00.');

    // 4. Razorpay Order Creation
    console.log('\n[4/6] Testing Razorpay ₹1 Order Creation...');
    const orderRes = await paymentService.createRazorpayOrder({
      amount: 1.00,
      notes: { test_run: true }
    });
    assert(orderRes.success === true, 'Razorpay order creation succeeded.');
    assert(orderRes.orderId && orderRes.orderId.length > 5, `Order ID created: ${orderRes.orderId}`);
    assert(orderRes.amount === 100, 'Order amount in paise is 100 (₹1.00).');

    // 5. Payment Signature Verification
    console.log('\n[5/6] Testing Payment Signature Verification...');
    const verifyRes = await paymentService.verifyPaymentSignature({
      razorpay_order_id: orderRes.orderId,
      razorpay_payment_id: 'pay_test_payment_123',
      razorpay_signature: 'test_mock_signature'
    });
    assert(verifyRes.verified === true, 'Payment signature verified and logged.');

    // 6. Multi-Channel Batch Notification
    console.log('\n[6/6] Testing Multi-Channel Batch Notification Dispatch...');
    const notifRes = await notificationService.sendToRecipients({
      channels: ['email', 'whatsapp', 'sms'],
      subject: 'Integration Test Alert',
      message: 'This is a test notification verifying email, WhatsApp, and SMS dispatch pipelines.'
    });
    assert(notifRes.success === true, 'Batch notification dispatch executed.');
    assert(notifRes.totalDispatched >= 2, `Total dispatched logs: ${notifRes.totalDispatched}`);

    // Verify Audit Logs
    const notifLogs = await notificationService.getNotificationHistory(10);
    assert(notifLogs.length > 0, `Audit logs recorded: ${notifLogs.length} notifications logged in DB.`);

    const paymentLogs = await paymentService.getPaymentHistory(10);
    assert(paymentLogs.length >= 2, `Audit logs recorded: ${paymentLogs.length} payments logged in DB.`);

    console.log('\n======================================================');
    console.log(`🎯 Test Summary: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error during test suite:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  runTestSuite();
}

module.exports = runTestSuite;
