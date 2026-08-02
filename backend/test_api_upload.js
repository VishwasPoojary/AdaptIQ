const fs = require('fs');
const path = require('path');

async function testUpload() {
    try {
        const fetch = (await import('node-fetch')).default;
        const FormData = require('form-data');

        const form = new FormData();
        form.append('subject', 'Test Subject');
        form.append('file', fs.createReadStream(path.join(__dirname, 'dummy.txt')));

        console.log("Sending request...");
        const response = await fetch('http://localhost:5000/api/notes/upload', {
            method: 'POST',
            body: form,
            headers: form.getHeaders()
        });

        const data = await response.json();
        console.log("Status:", response.status);
        console.log("Response:", data);
    } catch (error) {
        console.error("Error:", error);
    }
}

testUpload();
