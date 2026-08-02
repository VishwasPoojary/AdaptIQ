/**
 * ====================================================
 *  AdaptIQ — Automated MongoDB Atlas Setup Script
 * ====================================================
 * This script will:
 *  1. Create a free M0 cluster on MongoDB Atlas
 *  2. Create a database user (adaptiquser)
 *  3. Whitelist all IPs (0.0.0.0/0)
 *  4. Get the connection string
 *  5. Automatically update your server.js with it
 * ====================================================
 * HOW TO USE:
 *  1. Go to https://cloud.mongodb.com
 *  2. Sign up / Log in
 *  3. Click your profile icon (top right) → "Organization Settings"
 *     OR go to: https://cloud.mongodb.com/v2#/account/public-api-access
 *  4. Under "API Keys", click "Create API Key"
 *  5. Set description: "AdaptIQ Setup" and give it "Project Owner" permission
 *  6. Copy the Public Key and Private Key
 *  7. Also find your Organization ID from Organization Settings
 *  8. Paste all 3 values below and run: node setup-atlas.js
 * ====================================================
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ============================================================
// 🔴 FILL IN THESE 3 VALUES (from MongoDB Atlas dashboard)
// ============================================================
const PUBLIC_KEY  = 'YOUR_PUBLIC_KEY_HERE';   // e.g. "abcdefgh"
const PRIVATE_KEY = 'YOUR_PRIVATE_KEY_HERE';  // e.g. "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
const ORG_ID      = 'YOUR_ORG_ID_HERE';       // e.g. "60f1a2b3c4d5e6f7a8b9c0d1"
// ============================================================

const DB_USER     = 'adaptiquser';
const DB_PASSWORD = 'AdaptIQ@2026!';
const CLUSTER_NAME = 'AdaptIQCluster';
const DB_NAME      = 'adaptiq';

// Digest Auth helper (Atlas API requires HTTP Digest Authentication)
const crypto = require('crypto');

function digestAuth(method, uri, realm, nonce, opaque, ha1OverrideUser, ha1OverridePass) {
  const user = ha1OverrideUser;
  const pass = ha1OverridePass;
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');
  const ha1 = crypto.createHash('md5').update(`${user}:${realm}:${pass}`).digest('hex');
  const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
  const response = crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`).digest('hex');
  return `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", nc=${nc}, cnonce="${cnonce}", response="${response}", opaque="${opaque}", qop=auth`;
}

function apiRequest(method, urlPath, body = null, authHeader = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'cloud.mongodb.com',
      path: urlPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      }
    };
    if (authHeader) options.headers['Authorization'] = authHeader;

    const req = https.request(options, (res) => {
      // First request may return 401 with digest challenge
      if (res.statusCode === 401 && !authHeader) {
        const wwwAuth = res.headers['www-authenticate'];
        const realm   = (wwwAuth.match(/realm="([^"]+)"/)   || [])[1];
        const nonce   = (wwwAuth.match(/nonce="([^"]+)"/)   || [])[1];
        const opaque  = (wwwAuth.match(/opaque="([^"]+)"/)  || [])[1] || '';
        const auth = digestAuth(method, urlPath, realm, nonce, opaque, PUBLIC_KEY, PRIVATE_KEY);
        return resolve(apiRequest(method, urlPath, body, auth));
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function setup() {
  if (PUBLIC_KEY === 'YOUR_PUBLIC_KEY_HERE') {
    console.log('\n❌ ERROR: You have not filled in your API keys yet!');
    console.log('');
    console.log('📋 Follow these steps:');
    console.log('   1. Go to: https://cloud.mongodb.com');
    console.log('   2. Sign up for a FREE account');
    console.log('   3. Go to your profile → Organization Settings → API Keys');
    console.log('   4. Click "Create API Key"');
    console.log('   5. Give it "Organization Owner" permission');
    console.log('   6. Copy the Public Key and Private Key');
    console.log('   7. Get your Org ID from Organization Settings');
    console.log('   8. Open setup-atlas.js and paste the 3 values');
    console.log('   9. Run: node setup-atlas.js');
    console.log('');
    return;
  }

  console.log('🚀 Starting MongoDB Atlas automated setup...\n');

  // Step 1: Create Project
  console.log('📁 Step 1: Creating Atlas Project...');
  let res = await apiRequest('POST', '/api/atlas/v1.0/groups', {
    name: 'AdaptIQ',
    orgId: ORG_ID
  });
  
  let projectId;
  if (res.status === 201) {
    projectId = res.body.id;
    console.log(`   ✅ Project created! ID: ${projectId}`);
  } else if (res.body && res.body.errorCode === 'GROUP_ALREADY_EXISTS') {
    // Project exists, get it
    res = await apiRequest('GET', `/api/atlas/v1.0/groups/byName/AdaptIQ`);
    projectId = res.body.id;
    console.log(`   ✅ Project already exists! ID: ${projectId}`);
  } else {
    console.log('   ❌ Failed to create project:', JSON.stringify(res.body, null, 2));
    return;
  }

  // Step 2: Create free M0 cluster
  console.log('\n☁️  Step 2: Creating free M0 cluster (this takes ~3 minutes)...');
  res = await apiRequest('POST', `/api/atlas/v1.0/groups/${projectId}/clusters`, {
    name: CLUSTER_NAME,
    clusterType: 'REPLICASET',
    providerSettings: {
      providerName: 'TENANT',
      backingProviderName: 'AWS',
      regionName: 'AP_SOUTH_1',
      instanceSizeName: 'M0'
    }
  });

  if (res.status === 201 || res.status === 200) {
    console.log(`   ✅ Cluster "${CLUSTER_NAME}" created! (provisioning in background)`);
  } else if (res.body && res.body.errorCode === 'CLUSTER_ALREADY_EXISTS') {
    console.log(`   ✅ Cluster already exists, continuing...`);
  } else {
    console.log('   ❌ Failed to create cluster:', JSON.stringify(res.body, null, 2));
    return;
  }

  // Step 3: Create Database User
  console.log('\n👤 Step 3: Creating database user...');
  res = await apiRequest('POST', `/api/atlas/v1.0/groups/${projectId}/databaseUsers`, {
    databaseName: 'admin',
    username: DB_USER,
    password: DB_PASSWORD,
    roles: [{ roleName: 'readWriteAnyDatabase', databaseName: 'admin' }]
  });

  if (res.status === 201 || res.status === 200) {
    console.log(`   ✅ Database user "${DB_USER}" created!`);
  } else if (res.body && res.body.errorCode === 'USER_ALREADY_EXISTS') {
    console.log(`   ✅ User already exists, continuing...`);
  } else {
    console.log('   ❌ Failed to create user:', JSON.stringify(res.body, null, 2));
    return;
  }

  // Step 4: Whitelist all IPs
  console.log('\n🌐 Step 4: Allowing all IP addresses...');
  res = await apiRequest('POST', `/api/atlas/v1.0/groups/${projectId}/accessList`, [
    { cidrBlock: '0.0.0.0/0', comment: 'Allow access from anywhere' }
  ]);

  if (res.status === 201 || res.status === 200) {
    console.log('   ✅ All IPs whitelisted!');
  } else if (res.body && res.body.errorCode === 'NETWORK_PERMISSION_ENTRY_ALREADY_EXISTS') {
    console.log('   ✅ IP already whitelisted, continuing...');
  } else {
    console.log('   ⚠️  IP whitelist response:', JSON.stringify(res.body, null, 2));
  }

  // Step 5: Get connection string (cluster may still be provisioning, so we build it manually)
  console.log('\n🔗 Step 5: Building connection string...');
  
  // Get cluster hostname
  res = await apiRequest('GET', `/api/atlas/v1.0/groups/${projectId}/clusters/${CLUSTER_NAME}`);
  
  let connectionString;
  if (res.body && res.body.connectionStrings) {
    const srv = res.body.connectionStrings.standardSrv;
    connectionString = srv.replace('mongodb+srv://', `mongodb+srv://${DB_USER}:${DB_PASSWORD}@`) + `/${DB_NAME}?retryWrites=true&w=majority`;
  } else {
    // Cluster still provisioning — build string with placeholder hostname
    connectionString = `mongodb+srv://${DB_USER}:${DB_PASSWORD}@${CLUSTER_NAME.toLowerCase()}.mongodb.net/${DB_NAME}?retryWrites=true&w=majority`;
    console.log('   ⏳ Cluster still provisioning... connection string built manually.');
  }
  
  console.log(`\n   ✅ Connection String:\n   ${connectionString}\n`);

  // Step 6: Update server.js
  console.log('📝 Step 6: Updating server.js...');
  const serverJsPath = path.join(__dirname, 'server.js');
  let content = fs.readFileSync(serverJsPath, 'utf-8');
  
  content = content.replace(
    /mongoose\.connect\(['"`][^'"`]+['"`]\)/,
    `mongoose.connect('${connectionString}')`
  );
  
  fs.writeFileSync(serverJsPath, content, 'utf-8');
  console.log('   ✅ server.js updated with Atlas connection string!\n');

  // Done!
  console.log('='.repeat(60));
  console.log('🎉 SETUP COMPLETE!');
  console.log('='.repeat(60));
  console.log('');
  console.log('📌 Your MongoDB Atlas connection string:');
  console.log(`   ${connectionString}`);
  console.log('');
  console.log('📌 Database Username: ' + DB_USER);
  console.log('📌 Database Password: ' + DB_PASSWORD);
  console.log('');
  console.log('⚠️  NOTE: The cluster takes ~3-5 minutes to fully provision.');
  console.log('   Restart your server after waiting: node server.js');
  console.log('');
  console.log('🚀 NEXT STEP: Deploy your backend to Render.com (free)');
  console.log('   so your Firebase website can use it!');
  console.log('');
}

setup().catch(console.error);
