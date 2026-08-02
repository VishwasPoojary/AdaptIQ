const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://adaptiq-backend.onrender.com';
const SUBJECT = 'Programming in C';
const FILE_PATH = path.join(__dirname, 'dummy_test.txt');

async function testUpload() {
    console.log("🚀 Initiating production upload integration test...");
    
    // Create a dummy test file
    fs.writeFileSync(FILE_PATH, "This is a brief file content to test the production upload and Cloudinary stream.");
    
    try {
        const fetch = (await import('node-fetch')).default;
        const FormData = require('form-data');
        const form = new FormData();
        form.append('subject', SUBJECT);
        form.append('file', fs.createReadStream(FILE_PATH));
        
        const token = 'adaptiq-secure-admin-token-2026';
        console.log(`📤 Sending POST request via node-fetch to ${BASE_URL}/api/notes/upload...`);
        
        const response = await fetch(`${BASE_URL}/api/notes/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                ...form.getHeaders()
            },
            body: form
        });
        
        console.log(`Status Code: ${response.status}`);
        const bodyText = await response.text();
        console.log("Response Body:", bodyText);
    } catch (err) {
        console.error("❌ Exception during POST request:", err);
    } finally {
        // Clean up the dummy file
        if (fs.existsSync(FILE_PATH)) {
            fs.unlinkSync(FILE_PATH);
        }
    }
}

testUpload();
