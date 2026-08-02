const cloudinary = require('cloudinary').v2;
cloudinary.config({
    cloud_name: 'dmacohjvl',
    api_key: '725321288544574',
    api_secret: 'F6TlhgOfoHl-J5g-TE8SFV4cLcU'
});

const buffer = Buffer.from("Hello world! Direct buffer streaming to Cloudinary raw file.");

function uploadBuffer() {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: 'adaptiq_notes',
                resource_type: 'raw',
                public_id: `test-buffer-${Date.now()}.txt`
            },
            (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            }
        );
        stream.end(buffer);
    });
}

uploadBuffer()
    .then(result => console.log('✅ Direct Buffer Upload Success:', result.secure_url))
    .catch(error => console.log('❌ Direct Buffer Upload Error:', error));
