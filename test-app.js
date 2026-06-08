import puppeteer from 'puppeteer';

(async () => {
  console.log('Starting automated test...');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  const errors = [];
  page.on('pageerror', err => {
    errors.push(`Page error: ${err.message}`);
  });
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('favicon') && !msg.text().includes('Failed to load resource')) {
      errors.push(`Console error: ${msg.text()}`);
    }
  });

  try {
    console.log('Navigating to root...');
    await page.goto('http://localhost:5174', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    // Attempt to log in if on login page
    if (page.url().includes('login')) {
      console.log('Logging in...');
      await page.waitForSelector('input[type="email"]', { timeout: 5000 }).catch(() => {});
      const emailInput = await page.$('input[type="email"]');
      if (emailInput) {
        await page.type('input[type="email"]', 'admin@example.com');
        await page.type('input[type="password"]', 'password123'); // Adjust as needed
        await page.click('button[type="submit"]');
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    console.log('Checking /warehouse...');
    await page.goto('http://localhost:5174/warehouse', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('Checking /transfers...');
    await page.goto('http://localhost:5174/transfers', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    console.log('Checking /inventory...');
    await page.goto('http://localhost:5174/inventory', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    console.log('Automated navigation complete.');
  } catch (error) {
    console.error('Test script encountered an error:', error);
  } finally {
    if (errors.length > 0) {
      console.log('--- ERRORS FOUND ---');
      errors.forEach(e => console.log(e));
    } else {
      console.log('--- ALL CLEAR. NO ERRORS. ---');
    }
    await browser.close();
  }
})();
