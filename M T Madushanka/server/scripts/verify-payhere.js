// verify-payhere.js - checks the PayHere settings in .env
const crypto = require('crypto');
const config = require('../../../shared/server/src/config/env');
const payhere = require('../src/modules/payment/payhereGateway');

const md5Upper = (value) => crypto.createHash('md5').update(String(value)).digest('hex').toUpperCase();

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`          expected: ${expected}\n          actual:   ${actual}`);
}

console.log('\nPayHere configuration');
console.log('---------------------');
if (!payhere.isConfigured()) {
  console.log('  Online payments are OFF - the app will use the built-in simulator.');
  console.log('  To switch them on, set these in server/.env:');
  console.log('    PAYHERE_MERCHANT_ID, PAYHERE_MERCHANT_SECRET, PUBLIC_BASE_URL');
  process.exit(0);
}

console.log(`  Mode:          ${config.payhere.mode.toUpperCase()}`);
console.log(`  Merchant ID:   ${config.payhere.merchantId}`);
console.log(`  Currency:      ${config.payhere.currency}`);
console.log(`  Public URL:    ${config.payhere.publicBaseUrl}`);
console.log(`  Notify URL:    ${payhere.notifyUrl()}`);
console.log('\n  The Public URL must be reachable from the internet and must match a');
console.log('  domain you added under PayHere -> Settings -> Domains & Credentials,');
console.log('  otherwise PayHere rejects the checkout as an unauthorised request.');

console.log('\nSigning self-test');
console.log('-----------------');

const checkout = payhere.buildCheckoutRequest({
  paymentId: 1,
  amount: 1500.5,
  itemDescription: 'Tuition fee - self test',
  student: { fullName: 'Test Student', email: 'test@example.com', phone: '0771234567' },
});

check(
  'amount is sent with exactly two decimals',
  checkout.fields.amount,
  '1500.50'
);
check(
  'checkout hash matches PayHere formula',
  checkout.fields.hash,
  md5Upper(
    config.payhere.merchantId +
      'BI-1' +
      '1500.50' +
      config.payhere.currency +
      md5Upper(config.payhere.merchantSecret)
  )
);

const signedBody = {
  merchant_id: config.payhere.merchantId,
  order_id: 'BI-1',
  payment_id: '000000000',
  payhere_amount: '1500.50',
  payhere_currency: config.payhere.currency,
  status_code: '2',
  method: 'VISA',
};
signedBody.md5sig = md5Upper(
  config.payhere.merchantId +
    'BI-1' +
    '1500.50' +
    config.payhere.currency +
    '2' +
    md5Upper(config.payhere.merchantSecret)
);

check('a correctly signed notification is accepted', payhere.verifyNotification(signedBody).valid, true);
check(
  'a notification with a tampered amount is rejected',
  payhere.verifyNotification({ ...signedBody, payhere_amount: '1.00' }).valid,
  false
);
check(
  'an unsigned notification is rejected',
  payhere.verifyNotification({ ...signedBody, md5sig: undefined }).valid,
  false
);

if (failures === 0) {
  console.log('\nAll good. Try a sandbox payment next, with a PayHere test card:');
  console.log('    Visa        4916217501611292');
  console.log('    Mastercard  5307732125531191');
  console.log('  Any cardholder name, any future expiry and any CVV are accepted.');
  console.log('  In sandbox, ANY other card number is meant to fail - that is how you');
  console.log('  test the declined path.\n');
} else {
  console.log(`\n${failures} check(s) FAILED - do not take real payments until this is fixed.\n`);
}
process.exit(failures === 0 ? 0 : 1);
