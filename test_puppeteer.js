const puppeteer = require('puppeteer');

(async () => {
    console.log('Starting puppeteer to test shop.html...');
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));

    await page.goto('http://localhost:3000/shop.html', { waitUntil: 'networkidle0', timeout: 30000 }).catch(e => console.log('Goto error:', e));

    console.log('Wait 10s for API timeout to hit...');
    await new Promise(r => setTimeout(r, 10000));

    const content = await page.evaluate(() => {
        return document.getElementById('product-grid') ? document.getElementById('product-grid').innerHTML : 'No grid found';
    });

    console.log('Final grid content snippet:', content.substring(0, 200).replace(/\n/g, ' '));

    await browser.close();
})();
