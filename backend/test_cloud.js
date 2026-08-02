const cloudinary = require('cloudinary').v2;
cloudinary.config({
    cloud_name: 'dmacohjvl',
    api_key: '725321288544574',
    api_secret: 'F6TlhgOfoHl-J5g-TE8SFV4cLcU'
});

cloudinary.uploader.upload('dummy.txt', { resource_type: 'auto' })
    .then(result => console.log('Success:', result))
    .catch(error => console.log('Error:', error));
