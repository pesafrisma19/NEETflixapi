const { Client } = require('ssh2');
const fs = require('fs');
const { execSync } = require('child_process');

try {
  console.log('Packing latest backend files & mappings.json into neetflixapi_clean.tar.gz...');
  execSync('tar -czf neetflixapi_clean.tar.gz --exclude=node_modules --exclude=.git .');
  console.log('✅ Archive created successfully with latest mappings.json!');
} catch (e) {
  console.warn('Warning creating tar archive:', e.message);
}

const conn = new Client();
const host = '101.32.108.245';
const user = 'ubuntu';
const pass = 'NEETflix123@';

const commands = [
  'echo "Setting up Node.js..."',
  'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -',
  'sudo apt-get install -y nodejs',
  'sudo npm install -g pm2',
  'echo "Node and PM2 installed!"',
  'mkdir -p ~/neetflixapi',
  'tar -xzf ~/neetflixapi_clean.tar.gz -C ~/neetflixapi',
  'echo "Files extracted!"',
  'cd ~/neetflixapi && npm install',
  'echo "Dependencies installed!"',
  'pm2 stop neetflixapi || true',
  'cd ~/neetflixapi && pm2 start server.js --name neetflixapi',
  'echo "API is now running via PM2!"',
  'pm2 save',
  'sudo ufw allow 4444 || true'
];

conn.on('ready', () => {
  console.log('SSH Connection ready!');
  conn.sftp((err, sftp) => {
    if (err) throw err;
    console.log('Uploading neetflixapi_clean.tar.gz...');
    sftp.fastPut('neetflixapi_clean.tar.gz', '/home/ubuntu/neetflixapi_clean.tar.gz', (err) => {
      if (err) throw err;
      console.log('Upload complete! Executing setup commands...');
      
      conn.exec(commands.join(' && '), (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
          console.log(`Setup finished with code ${code}.`);
          conn.end();
        }).on('data', (data) => {
          process.stdout.write(data);
        }).stderr.on('data', (data) => {
          process.stderr.write(data);
        });
      });
    });
  });
}).on('error', (err) => {
  console.error('Connection Error:', err.message);
}).connect({
  host: host,
  port: 22,
  username: user,
  password: pass,
  readyTimeout: 20000
});
