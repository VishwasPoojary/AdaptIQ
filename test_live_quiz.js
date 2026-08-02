// Using global fetch (built-in)

async function testQuiz() {
    try {
        const response = await fetch('https://adaptiq-backend.onrender.com/api/quiz/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'Photosynthesis converts light into chemical energy.' })
        });
        
        console.log(`Status: ${response.status}`);
        const text = await response.text();
        console.log(`Body: ${text}`);
    } catch (err) {
        console.error(err);
    }
}

testQuiz();
