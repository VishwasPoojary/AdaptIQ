require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dns = require('dns');

// Force Node.js to use Google DNS (fixes ISP DNS blocking SRV lookups)
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection using environment variable
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB Atlas Connected!'))
    .catch(err => console.log('MongoDB Connection Error: ', err));

// Status endpoint to verify connection
app.get('/api/status', (req, res) => {
    res.json({
        server: 'online',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        timestamp: new Date()
    });
});

// Admin Authentication Middleware
function authorizeAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }
    const token = authHeader.split(' ')[1];
    if (token !== process.env.ADMIN_SESSION_TOKEN) {
        return res.status(403).json({ error: 'Forbidden: Invalid session token' });
    }
    next();
}

// Admin Login Endpoint
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        res.json({ success: true, token: process.env.ADMIN_SESSION_TOKEN });
    } else {
        res.status(401).json({ error: 'Invalid username or password' });
    }
});

// Gemini AI Quiz Generation Endpoint (Secure backend processing)
app.post('/api/quiz/generate', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Text content is required' });
        }

        const fetch = (await import('node-fetch')).default;
        const prompt = `Create a 20-question multiple-choice quiz based strictly on the provided text. Each question must have exactly 4 options and the correct answer index (0 to 3). Keep questions challenging but strictly factual from the text.
        Text: ${text}`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            questions: {
                                type: "ARRAY",
                                items: {
                                    type: "OBJECT",
                                    properties: {
                                        question: { type: "STRING" },
                                        options: {
                                            type: "ARRAY",
                                            items: { type: "STRING" }
                                        },
                                        answer: { type: "INTEGER" }
                                    },
                                    required: ["question", "options", "answer"]
                                }
                            }
                        },
                        required: ["questions"]
                    }
                }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error("Gemini API Error: " + response.status + " " + errText);
        }

        const data = await response.json();
        const contentText = data.candidates[0].content.parts[0].text;
        const parsed = JSON.parse(contentText.trim());
        res.json({ questions: parsed.questions });
    } catch (error) {
        console.error("Quiz generation error:", error);
        res.status(500).json({ error: 'Failed to generate quiz: ' + error.message });
    }
});

// Mongoose Schema for Notes
const noteSchema = new mongoose.Schema({
    subject: { type: String, required: true },
    fileName: { type: String, required: true },
    filePath: { type: String, required: true },
    fileType: { type: String, required: true }, // 'pdf', 'doc', 'docx', etc.
    uploadedAt: { type: Date, default: Date.now }
});

const Note = mongoose.model('Note', noteSchema);

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary using environment variables
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Multer Memory Storage
const storage = multer.memoryStorage();

// Enforce strict size boundaries in Multer (10MB limit)
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// API Endpoints

// 1. Upload a Note (Protected)
app.post('/api/notes/upload', authorizeAdmin, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const { subject } = req.body;
        if (!subject) {
            return res.status(400).json({ error: 'Subject is required' });
        }

        // Determine raw file extension or auto-detected image resource type
        const ext = path.extname(req.file.originalname).toLowerCase();
        const baseName = path.basename(req.file.originalname, ext);
        const ts = Date.now();
        const isRaw = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'].includes(ext);
        
        const resourceType = isRaw ? 'raw' : 'auto';
        const publicId = isRaw ? `${ts}-${baseName}${ext}` : `${ts}-${baseName}`;

        // Stream the memory buffer directly to Cloudinary
        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder: 'adaptiq_notes',
                    resource_type: resourceType,
                    public_id: publicId
                },
                (error, uploadResult) => {
                    if (error) {
                        return reject(error);
                    }
                    resolve(uploadResult);
                }
            );
            stream.end(req.file.buffer);
        });

        const newNote = new Note({
            subject,
            fileName: req.file.originalname,
            filePath: result.secure_url || result.url, // Secure Cloudinary URL
            fileType: ext.substring(1)
        });

        await newNote.save();
        res.status(201).json({ message: 'File uploaded successfully', note: newNote });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload file: ' + error.message });
    }
});

// 2. Get Notes by Subject (Public)
app.get('/api/notes/:subject', async (req, res) => {
    try {
        const notes = await Note.find({ subject: req.params.subject }).sort({ uploadedAt: -1 });
        res.json(notes);
    } catch (error) {
        console.error('Fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch notes' });
    }
});

// 3. Get All Notes (Public)
app.get('/api/notes', async (req, res) => {
    try {
        const notes = await Note.find().sort({ uploadedAt: -1 });
        res.json(notes);
    } catch (error) {
        console.error('Fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch notes' });
    }
});

// 4. Delete a Note (Protected)
app.delete('/api/notes/:id', authorizeAdmin, async (req, res) => {
    try {
        const note = await Note.findById(req.params.id);
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }
        
        // Delete from database
        await Note.findByIdAndDelete(req.params.id);
        res.json({ message: 'Note deleted successfully' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Failed to delete note' });
    }
});

// 5. Update a Note (Protected)
app.put('/api/notes/:id', authorizeAdmin, async (req, res) => {
    try {
        const { subject, fileName } = req.body;
        const updatedNote = await Note.findByIdAndUpdate(
            req.params.id,
            { subject, fileName },
            { new: true }
        );
        if (!updatedNote) {
            return res.status(404).json({ error: 'Note not found' });
        }
        res.json({ message: 'Note updated successfully', note: updatedNote });
    } catch (error) {
        console.error('Update error:', error);
        res.status(500).json({ error: 'Failed to update note' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
