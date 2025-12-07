const express = require('express')
const cors = require('cors');
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);

const port = process.env.PORT || 3000

// middleware
app.use(express.json());
app.use(cors());

const verifyFBToken = async (req, res, next) => {
    const token = req.headers.authorization;

    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
    }

    try {
        const idToken = token.split(' ')[1];
        const decoded = await admin.auth().verifyIdToken(idToken);
        console.log('decoded in the token', decoded);
        req.decoded_email = decoded.email;
        next();
    }
    catch (err) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xue6gdd.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        await client.connect();

        // Database and Collection
        const db = client.db('eTuitionBdDB');
        const userCollection = db.collection('users');
        const tuitionCollection = db.collection('tuitions');

        // User APIs
        app.post('/users', async (req, res) => {
            const user = req.body;
            user.createdAt = new Date();
            const email = user.email;
            const userExists = await userCollection.findOne({ email })

            if (userExists) {
                return res.status(409).send({ message: 'User already exists' })
            }

            if (!user.role) {
                user.role = "Student";
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        // latest tuition posts for homepage
        app.get('/latest-tuitions', async (req, res) => {
            const result = await tuitionCollection.find({}).sort({ createdAt: -1 }).limit(4).toArray();
            res.send(result);
        });
        
        

        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('eTuitionBd is shifting shifting!')
})

app.listen(port, () => {
    console.log(`eTuitionBd listening on port ${port}`)
})