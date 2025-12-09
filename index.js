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
        const applyTuitionCollection = db.collection('appliedTuitions');

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

        // Get single tuition post(Details page)
        app.get('/tuition/:id', async (req, res) => {
            const id = req.params.id;
            const result = await tuitionCollection.findOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // Apply for a tuition post (Details page)
        app.post('/apply-tuition', async (req, res) => {
            const application = req.body;
            application.appliedAt = new Date();
            application.status = "Pending";

            // Duplicate application check
            const existing = await applyTuitionCollection.findOne({
                tuitionId: application.tuitionId,
                tutorEmail: application.tutorEmail
            });

            if (existing) { 
                return res.send({ success: false, message: "You have already applied for this tuition." });
            }

            const result = await applyTuitionCollection.insertOne(application);
            res.send({ success: true, message: "Application submitted successfully!", insertedId: result.insertedId });
        });


        // All tuition get api
        // app.get('/all-tuitions', async (req, res) => {
        //     const result = await tuitionCollection.find({}).toArray();
        //     res.send(result);
        // });

        // Jamela ache
        app.get('/all-tuitions', async (req, res) => {
            const search = req.query.search || "";
            const query = {
            $or: [
                { subject: { $regex: search, $options: "i" } },
                { location: { $regex: search, $options: "i" } }
            ]
            };
            const result = await tuitionCollection.find(query).toArray();
            res.send(result);
        });

        // latest-tutors get api for homepage
        app.get('/latest-tutors', async (req, res) => {
            const result = await userCollection.find({ role: 'Tutor' }).sort({ createdAt: -1 }).limit(4).toArray();
            res.send(result);
        }); 

        // All tutors get api
        app.get('/all-tutors', async (req, res) => {
            const result = await userCollection.find({ role: 'Tutor' }).toArray();
            res.send(result);
        });

    // Dashboard related APIs........
        // Add tuition post
        app.post('/add-tuition', async (req, res) => {
            const tuition = req.body;
            tuition.createdAt = new Date();
            tuition.status = "Pending";
            const result = await tuitionCollection.insertOne(tuition);
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