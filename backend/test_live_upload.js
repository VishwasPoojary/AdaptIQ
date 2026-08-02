const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://adaptiq-backend.onrender.com';
const SUBJECT = 'Services Marketing';
const FILE_PATH = path.join(__dirname, 'dummy.txt');

async function testLiveWorkflow() {
  console.log('🚀 Starting live backend integration test...');
  
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, 'This is a dummy study note for testing AdaptIQ deployment.');
    console.log('Created dummy.txt for test.');
  }

  try {
    const fetch = (await import('node-fetch')).default;
    const FormData = require('form-data');

    // 1. Upload the dummy note
    console.log(`📤 Uploading test note to subject "${SUBJECT}"...`);
    const form = new FormData();
    form.append('subject', SUBJECT);
    form.append('file', fs.createReadStream(FILE_PATH));

    const uploadRes = await fetch(`${BASE_URL}/api/notes/upload`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    if (!uploadRes.ok) {
      throw new Error(`Upload failed with status: ${uploadRes.status}`);
    }

    const uploadData = await uploadRes.json();
    console.log('✅ Upload successful! Note metadata:', uploadData.note);
    const noteId = uploadData.note._id;

    // 2. Fetch the notes for the subject to verify it appears
    console.log(`📥 Fetching notes for subject "${SUBJECT}"...`);
    const fetchRes = await fetch(`${BASE_URL}/api/notes/${encodeURIComponent(SUBJECT)}`);
    if (!fetchRes.ok) {
      throw new Error(`Fetch failed with status: ${fetchRes.status}`);
    }

    const notesList = await fetchRes.json();
    console.log(`✅ Fetch successful! Found ${notesList.length} notes.`);
    const found = notesList.find(n => n._id === noteId);
    
    if (found) {
      console.log(`🎉 Verified! The newly uploaded note "${found.fileName}" is present in the database!`);
    } else {
      console.error('❌ Error: Uploaded note not found in the fetched list.');
    }

    // 3. Clean up by deleting the test note
    console.log(`🧹 Cleaning up: Deleting note with ID ${noteId}...`);
    const deleteRes = await fetch(`${BASE_URL}/api/notes/${noteId}`, {
      method: 'DELETE'
    });

    if (!deleteRes.ok) {
      throw new Error(`Delete failed with status: ${deleteRes.status}`);
    }

    const deleteData = await deleteRes.json();
    console.log('✅ Cleanup successful! Response:', deleteData);
    console.log('✨ All live backend checks passed perfectly!');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

testLiveWorkflow();
