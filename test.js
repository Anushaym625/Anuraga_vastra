const https = require('https');
const q = `
    query GetCollections($first: Int!) {
      collections(first: $first) {
        edges {
          node {
            id title handle description
            image { url altText }
            products(first: 1) {
              edges { node { images(first:1){ edges { node { url } } } } }
            }
          }
        }
      }
    }
  `;
const data = JSON.stringify({ query: q, variables: { first: 20 } });
const options = {
    hostname: 'vastraluu.myshopify.com',
    port: 443,
    path: '/api/2024-01/graphql.json',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': 'e6e796481662f11784c036ffcb9d86f2',
        'Content-Length': Buffer.byteLength(data)
    }
};
const req = https.request(options, res => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => console.log('Response:', body.substring(0, 500)));
});
req.on('error', e => console.error(e));
req.write(data);
req.end();
