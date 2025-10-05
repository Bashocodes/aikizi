const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const targets = [
  '/v1/images/direct-upload',
  '/v1/images/ingest-complete',
  'upload.imagedelivery.net',
  'imagedelivery.net'
];

function scan(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) scan(p);
    else if (/\.(js|ts|tsx|jsx|html|map|css)$/i.test(name)) {
      const text = fs.readFileSync(p, 'utf8');
      for (const t of targets) {
        if (text.includes(t)) {
          console.error(`❌ Found legacy upload token "${t}" in: ${p}`);
          process.exit(1);
        }
      }
    }
  }
}

const buildDir = fs.existsSync(path.join(ROOT, 'dist')) ? 'dist'
              : fs.existsSync(path.join(ROOT, 'build')) ? 'build'
              : null;

const publishDir = process.env.NETLIFY_PUBLISH_DIR
  ? path.isAbsolute(process.env.NETLIFY_PUBLISH_DIR)
    ? process.env.NETLIFY_PUBLISH_DIR
    : path.join(ROOT, process.env.NETLIFY_PUBLISH_DIR)
  : null;

const uniqueDirs = new Set([ROOT]);
if (buildDir) {
  uniqueDirs.add(path.join(ROOT, buildDir));
}
if (publishDir) {
  uniqueDirs.add(publishDir);
}

for (const dir of uniqueDirs) {
  scan(dir);
}

console.log('✅ No legacy upload tokens found.');
