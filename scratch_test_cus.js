async function test() {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch('http://localhost:8787/api/mzy/MzyGetCustomer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        PSCOMPANY: '01',
        PSCUSTOMER: '16660',
        PSCUSNAME1: '',
        PICUSTYPE: 1,
        PSCUSTYPE: 1
      }),
      signal: controller.signal
    });
    clearTimeout(t);
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Body:', text.slice(0, 500));
  } catch (e) {
    console.error('Fetch error:', e.message);
  }
}
test();
