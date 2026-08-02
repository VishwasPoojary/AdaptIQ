const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect('mongodb+srv://rynaldsouza02_db_user:rynal272006@cluster0.69dzcdu.mongodb.net/adaptiq?retryWrites=true&w=majority&appName=Cluster0')
.then(async () => {
    const db = mongoose.connection.db;
    const notes = await db.collection('notes').find({}).toArray();
    console.log(JSON.stringify(notes, null, 2));
    process.exit(0);
})
.catch(err => {
    console.error(err);
    process.exit(1);
});
