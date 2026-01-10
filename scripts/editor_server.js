const http = require('http');
const fs = require('fs');
const path = require('path');
const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'
};

const root = path.join(__dirname, '..');
const port = process.env.PORT || 3000;

function isLocalAddress(addr) {
  return addr === '::1' || addr === '127.0.0.1' || addr === '::ffff:127.0.0.1';
}

const server = http.createServer((req, res) => {
  const { method, url } = req;
  // Save endpoint
  if (method === 'POST' && url === '/save-visits') {
    if (!isLocalAddress(req.socket.remoteAddress)) {
      res.writeHead(403, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const json = JSON.parse(body);
        if (!json || typeof json !== 'object') throw new Error('Invalid');
        const dest = path.join(root, 'data', 'visits.json');
        const bak = dest + '.bak.' + Date.now();
        fs.copyFileSync(dest, bak);
        fs.writeFileSync(dest, JSON.stringify(json, null, 2), 'utf8');
        // Prune old backups, keep at most 3
        try {
          const dir = path.dirname(dest);
          const files = fs.readdirSync(dir).filter(f => f.startsWith('visits.json.bak.')).map(f => ({ f, p: path.join(dir, f), t: fs.statSync(path.join(dir,f)).mtimeMs }));
          files.sort((a,b)=>a.t - b.t);
          while (files.length > 3) {
            const rem = files.shift();
            try { fs.unlinkSync(rem.p); } catch (e) { /* ignore */ }
          }
        } catch (e) {
          /* ignore pruning errors */
        }
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ ok: true, backup: bak }));
        console.log('Saved visits.json; backup at', bak);
      } catch (e) {
        res.writeHead(400, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Serve static files under project root
  let f = url === '/' ? '/editor.html' : url;
  const filePath = path.join(root, f);
  if (!filePath.startsWith(root)) {
    res.writeHead(400); res.end('Bad request');
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404); res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {'Content-Type': mime[ext] || 'application/octet-stream'});
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log('Editor server listening at http://127.0.0.1:' + port);
});
