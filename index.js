const express = require('express')
const cors = require('cors');
const app = express();
require('dotenv').config();

const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);

const port = process.env.PORT || 3000

// middleware
app.use(express.json());
app.use(cors());

// JWT verification middleware
const verifyJwtToken = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ message: 'Unauthorized access ' });
    }

    const token = authorization.split(' ')[1];
    if (!token) {
        return res.status(401).send({ message: 'Unauthorized access2' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
        return res.status(401).send({ message: 'Unauthorized access: Invalid or expired token' });
    }
    req.user = decoded;
    next();
    });
};


// Student verification middleware
const verifyStudent = (req, res, next) => {
    if (req.user.role !== 'Student') {
        return res.status(403).send({ message: 'Forbidden: Students only' });
    }
    next();
};

// Tutor verification middleware
const verifyTutor = (req, res, next) => {
    if (req.user.role !== 'Tutor') {
        return res.status(403).send({ message: 'Forbidden: Tutors only' });
    }
    next();
};

// Admin verification middleware
const verifyAdmin = (req, res, next) => {
    if (req.user.role !== 'Admin') {
        return res.status(403).send({ message: 'Forbidden: Admins only' });
    }
    next();
};

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
        // await client.connect();

        // Database and Collection
        const db = client.db('eTuitionBdDB');
        const userCollection = db.collection('users');
        const tuitionCollection = db.collection('tuitions');
        const applyTuitionCollection = db.collection('appliedTuitions');
        const paymentCollection = db.collection('payments');

        // JWT Token API
        app.post('/getToken', async (req, res) => {
            try {
                const loggedUser = req.body;
                // console.log("getToken request:", loggedUser);
                const userInDb = await userCollection.findOne({ email: loggedUser.email });

                const payload = { 
                    email: loggedUser.email, 
                    role: userInDb.role 
                };

                const jwtToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
                res.send({ token: jwtToken });
            } catch (err) {
                console.error("Error issuing token:", err);
                res.status(500).send({ error: 'Failed to issue token' });
            }
        });

        // User APIs (Register & Login user info )
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
            user.status = "Active"
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

    // (Home Page related APIs)
        // latest tuition posts for homepage
        app.get('/latest-tuitions', async (req, res) => {
            const result = await tuitionCollection.find({status: "Approved"}).sort({ createdAt: -1 }).limit(4).toArray();
            res.send(result);
        });

        // Get single tuition post (Details page)
        app.get('/tuition/:id', async (req, res) => {
            const id = req.params.id;
            const result = await tuitionCollection.findOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // all-tuitions API with filtering, sorting, and pagination
        app.get('/all-tuitions', async (req, res) => {
            const search = req.query.search || "";
            const sort = req.query.sort || "date-desc";
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 8;
            const skip = (page - 1) * limit;

            const filterClass = req.query.class || "";
            const filterSubject = req.query.subject || "";
            const filterLocation = req.query.location || "";

            const query = {
                status: "Approved",
                // dropdown filter
                $and: [
                    filterClass ? { class: { $regex: filterClass, $options: "i" } } : {},
                    filterSubject ? { subject: { $regex: filterSubject, $options: "i" } } : {},
                    filterLocation ? { location: { $regex: filterLocation, $options: "i" } } : {},
                    {
                    // Search Bar
                    $or: [
                        { subject: { $regex: search, $options: "i" } },
                        { location: { $regex: search, $options: "i" } },
                        { class: { $regex: search, $options: "i" } }
                    ]
                    }
                ]
            };

            // Sorting options
            const sortMap = {
                "budget-asc": { budget: 1 },
                "budget-desc": { budget: -1 },
                "date-asc": { createdAt: 1 },
                "date-desc": { createdAt: -1 }
            };

            const total = await tuitionCollection.countDocuments(query);
            const result = await tuitionCollection.find(query).sort(sortMap[sort]).skip(skip).limit(limit).toArray();
            res.send({ total, page, limit, data: result });
        });

        // Tuition filters by Subject, Location and Class (All tuition page -Filters)
        app.get('/tuition-filters', async (req, res) => {
            const all = await tuitionCollection.find({ status: "Approved" }).toArray();
            const classes = [...new Set(all.map(t => t.class))];
            const subjects = [...new Set(all.map(t => t.subject))];
            const locations = [...new Set(all.map(t => t.location))];
            res.send({ classes, subjects, locations });
        });

        // latest-tutors get api (for homepage)
        app.get('/latest-tutors', async (req, res) => {
            const result = await userCollection.find({ role: 'Tutor' }).sort({ createdAt: -1 }).limit(4).toArray();
            res.send(result);
        }); 

        // All tutors get api (All tutors page)
        app.get('/all-tutors', async (req, res) => {
            const result = await userCollection.find({ role: 'Tutor' }).sort({createdAt: -1}).toArray();
            res.send(result);
        });

    // Dashboard related APIs
    // Student dashboard related APIs
        // Add tuition post ( Add Tuition page)
        app.post('/add-tuition',verifyJwtToken, verifyStudent, async (req, res) => {
            const tuition = req.body;
            tuition.createdAt = new Date();
            tuition.status = "Pending";
            const result = await tuitionCollection.insertOne(tuition);
            res.send(result);
        });

        // Get all tuition post by student email (My Tuitions page-Get)
        app.get('/my-tuitions', verifyJwtToken, verifyStudent, async (req, res) => {
            try {
                const email = req.query.email?.toLowerCase().trim();
                const tokenEmail = req.user.email?.toLowerCase().trim();

                if (email !== tokenEmail) {
                    return res.status(403).send({ message: 'Forbidden: You can only view your own tuitions' });
                }

                const query = { studentEmail: email, status: "Approved" };
                const result = await tuitionCollection.find(query).sort({ createdAt: -1 }).toArray();
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: "Failed to fetch student tuitions" });
            }
        });


        // delete tuition post by id (My Tuitions page-Delete)
        app.delete('/tuition/:id', verifyJwtToken, verifyStudent, async (req, res) => {
            const id = req.params.id;
            const tokenEmail = req.user.email?.toLowerCase().trim();
            const result = await tuitionCollection.deleteOne({ _id: new ObjectId(id), studentEmail: tokenEmail });
            res.send(result);
        });

        // Update tuition post by id (My Tuitions page-Update)
        app.patch('/tuition/:id', verifyJwtToken, verifyStudent, async (req, res) => {
            const id = req.params.id;
            const updatedTuition = req.body;
            if (updatedTuition._id) delete updatedTuition._id;

            const tokenEmail = req.user.email?.toLowerCase().trim();
            const query = { _id: new ObjectId(id), studentEmail: tokenEmail };
            const update = { $set: updatedTuition };

            try {
                const result = await tuitionCollection.updateOne(query, update);
                res.send(result);
            } catch (error) {
                res.status(500).send({ error: "Failed to update tuition post" });
            }
        });

        // Tutor Apply (Details page)
        app.post('/apply-tuition', async (req, res) => {
            const application = req.body;
            application.appliedAt = new Date();
            application.status = "Pending";
            application.tuitionId = new ObjectId(application.tuitionId);
            const existing = await applyTuitionCollection.findOne({ tuitionId: application.tuitionId, tutorEmail: application.tutorEmail });

            if (existing) {
                return res.send({ success: false, message: "You have already applied for this tuition." });
            }
            const result = await applyTuitionCollection.insertOne(application);
            res.send({ success: true, message: "Application submitted successfully!", insertedId: result.insertedId });
        });

        // Get all applications for a specific tuition post(Applied Tutors pages)
        app.get('/applications/student/:email', verifyJwtToken, verifyStudent, async (req, res) => {
            try {
                const studentEmail = req.params.email?.toLowerCase().trim();
                const tokenEmail = req.user.email?.toLowerCase().trim();

                if (studentEmail !== tokenEmail) {
                    return res.status(403).send({ message: 'Forbidden: You can only view your own applications' });
                }

                const result = await applyTuitionCollection.aggregate([
                    { $lookup: { from: "tuitions", localField: "tuitionId", foreignField: "_id", as: "tuitionInfo" } },
                    { $unwind: "$tuitionInfo" },
                    { $match: { "tuitionInfo.studentEmail": studentEmail, "tuitionInfo.status": "Approved" } }
                ]).toArray();

                res.send(result);
            } catch (error) {
                res.status(500).send({ error: "Failed to fetch applications" });
            }
        });

        // Student payment history API (Payment History page)
        app.get('/payments/:email', verifyJwtToken, verifyStudent, async (req, res) => {
            try {
                const email = req.params.email?.toLowerCase().trim();
                const tokenEmail = req.user.email?.toLowerCase().trim();

                if (email !== tokenEmail) {
                    return res.status(403).send({ message: 'Forbidden: You can only view your own payments' });
                }

                const payments = await paymentCollection.find({ studentEmail: email, paymentStatus: 'paid' }).sort({ paidAt: -1 }).toArray();
                res.send(payments);
            } catch (err) {
                res.status(500).send({ error: "Failed to fetch payments" });
            }
        });

        // Student stats API (Student Dashboard Home page)
        app.get('/student/stats/:email', verifyJwtToken, verifyStudent, async (req, res) => {
            try {
                const email = req.params.email?.toLowerCase().trim();
                const tokenEmail = req.user.email?.toLowerCase().trim();

                if (email !== tokenEmail) {
                    return res.status(403).send({ message: 'Forbidden: You can only view your own stats' });
                }

                const totalPosts = await tuitionCollection.countDocuments({ studentEmail: email });
                const approved = await tuitionCollection.countDocuments({ studentEmail: email, status: 'Approved' });
                const pending = await tuitionCollection.countDocuments({ studentEmail: email, status: 'Pending' });
                const rejected = await tuitionCollection.countDocuments({ studentEmail: email, status: 'Rejected' });

                res.send({ totalPosts, approved, pending, rejected });
            } catch (err) {
                res.status(500).send({ error: 'Failed to fetch student stats' });
            }
        });

    // Tutor related APIs
        // Get all applications by tutor email (My Applications page)
        app.get('/my-applications/tutor/:email', verifyJwtToken, verifyTutor, async (req, res) => {
            try {
                const tutorEmail = req.params.email?.toLowerCase().trim(); 
                const tokenEmail = req.user.email?.toLowerCase().trim();
                if (tutorEmail !== tokenEmail) { 
                    return res.status(403).send({ message: 'Forbidden: You can only view your own applications' }); 
                }
                const result = await applyTuitionCollection.find({ tutorEmail: tutorEmail }).sort({ appliedAt: -1 }).toArray();
                res.send(result);
            } catch (err) {
                console.error("Error fetching tutor applications:", err);
            res.status(500).send({ error: 'Failed to fetch applications' });
            }
        });

        // Update application (My Applications page-Update)
        app.patch('/applications/:id', verifyJwtToken, verifyTutor, async (req, res) => {
            const id = req.params.id;
            const updateData = req.body;

            const result = await applyTuitionCollection.updateOne(
                { _id: new ObjectId(id), tutorEmail: req.user.email, status: { $ne: "Approved" } },
                { $set: updateData }
            );
            res.send(result);
        });

        // Delete application (My Applications page-Delete)
        app.delete('/applications/:id', verifyJwtToken, verifyTutor, async (req, res) => {
            const id = req.params.id;
            const result = await applyTuitionCollection.deleteOne({ _id: new ObjectId(id), tutorEmail: req.user.email,  status: { $ne: "Approved" }});
            res.send(result);
        });

        // Ongoing tuitions for a tutor (Ongoing Tuitions page)
        app.get('/tuitions/ongoing/:email', verifyJwtToken, verifyTutor, async (req, res) => {
            try {
                const tutorEmail = req.params.email?.toLowerCase().trim();
                const tokenEmail = req.user.email?.toLowerCase().trim();

                if (tutorEmail !== tokenEmail) {
                    return res.status(403).send({ message: 'Forbidden: You can only view your own ongoing tuitions' });
                }

                const result = await applyTuitionCollection.find({ tutorEmail: tutorEmail, status: "Approved" }).toArray();
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: "Failed to fetch ongoing tuitions" });
            }
        });

        // Revenue details for a tutor (Revenue History page)
        app.get('/revenue/:tutorEmail', verifyJwtToken, verifyTutor, async (req, res) => {
            try {
                const tutorEmail = req.params.tutorEmail?.toLowerCase().trim();
                const tokenEmail = req.user.email?.toLowerCase().trim();

                if (tutorEmail !== tokenEmail) {
                    return res.status(403).send({ message: 'Forbidden: You can only view your own revenue history' });
                }

                const result = await paymentCollection.find({ tutorEmail: tutorEmail }).toArray();
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: "Failed to fetch revenue history" });
            }
        });

        // Tutor stats API(Tutor Dashboard Home page)
        app.get('/tutor/stats/:email',verifyJwtToken, verifyTutor,  async (req, res) => {
            try {
                const email = req.params.email?.toLowerCase().trim(); 
                const tokenEmail = req.user.email?.toLowerCase().trim();
                if (tokenEmail !== email) { 
                    return res.status(403).send({ message: 'Forbidden: You can only view your own stats' }); 
                }

                // const email = req.params.email;
                const totalApplications = await applyTuitionCollection.countDocuments({ tutorEmail: email });
                const approvedApplications = await applyTuitionCollection.countDocuments({ tutorEmail: email, status: 'Approved' });
                const pendingApplications = await applyTuitionCollection.countDocuments({ tutorEmail: email, status: 'Pending' });
                const rejectedApplications = await applyTuitionCollection.countDocuments({ tutorEmail: email, status: 'Rejected' });
                res.send({ totalApplications, approvedApplications, pendingApplications, rejectedApplications });
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: 'Failed to fetch tutor stats' });
            }
        });

    // Admin related APIs...
        // Get all users (User Management Page)
        app.get('/users', verifyJwtToken, verifyAdmin, async (req, res) => {
            try {
                const result = await userCollection.find({}).sort({createdAt: -1}).toArray();
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: "Failed to fetch users" });
            }
        });

        // Update user info (User Management-Update)
        app.patch('/users/:id', verifyJwtToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const updateData = req.body;
            const result = await userCollection.updateOne({ _id: new ObjectId(id) }, { $set: updateData } );
            res.send(result);
        });

        // Delete user account (User Management-Delete)
        app.delete('/users/:id', verifyJwtToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const result = await userCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // Get all pending tuition posts (Tuition Management page-Get)
        app.get('/tuitions', verifyJwtToken, verifyAdmin, async (req, res) => {
            try {
                const result = await tuitionCollection.find().sort({  createdAt: -1 }).toArray();
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: "Failed to fetch tuitions" });
            }
        });

        // Update tuition status (Tuition Management page-Update)
        app.patch('/tuitions/:id', verifyJwtToken, verifyAdmin, async (req, res) => {
            try {
                const id = req.params.id;
                const { status } = req.body;

                if (!["Pending", "Approved", "Rejected"].includes(status)) {
                    return res.status(400).send({ error: "Invalid status value" });
                }

                const result = await tuitionCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status } }
                );
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: "Failed to update tuition status" });
            }
        });

        // Reports & Analytics API (Reports & Analytics page)
        app.get('/admin/reports', verifyJwtToken, verifyAdmin, async (req, res) => {
            try {
                const totalEarningsAgg = await paymentCollection.aggregate([
                { $match: { paymentStatus: 'paid' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
                ]).toArray();

                const totalEarnings = totalEarningsAgg[0]?.total || 0;
                const transactions = await paymentCollection.find({ paymentStatus: 'paid' }).sort({ paidAt: -1 }).toArray();
                res.send({ totalEarnings, transactions });
            } catch (err) {
                res.status(500).send({ error: 'Failed to fetch reports' });
            }
        });

        // Admin dashboard stats (Admin Dashboard Home page)
        app.get('/admin/stats', verifyJwtToken, verifyAdmin, async (req, res) => {
            try {
                const userPipeline = [
                    { $group: { _id: '$status', count: { $sum: 1 } } }
                ];
                const rolePipeline = [
                    { $group: { _id: '$role', count: { $sum: 1 } } }
                ];
                const tuitionPipeline = [
                    { $group: { _id: '$status', count: { $sum: 1 } } }
                ];

                const [userStats, roleStats, tuitionStats, totalTuitions] = await Promise.all([
                    userCollection.aggregate(userPipeline).toArray(),
                    userCollection.aggregate(rolePipeline).toArray(),
                    tuitionCollection.aggregate(tuitionPipeline).toArray(),
                    tuitionCollection.countDocuments()
                ]);

                res.send({ userStats, roleStats, tuitionStats, totalTuitions });
            } catch (err) {
                res.status(500).send({ error: "Failed to fetch admin stats" });
            }
        });


    // Dashboard role (Role base conditional rendering)
        app.get('/users/:email/role', verifyJwtToken, async (req, res) => {
            const email = req.params.email;
            const query = { email }
            if (req.user.email !== email) { 
                return res.status(403).send({ message: 'Forbidden: You can only view your own role' }); 
            }
            const user = await userCollection.findOne(query);
            res.send({ role: user?.role || 'user' })
        })

    // Payment related APIs
       // Create Stripe checkout session (Applied Tutors page - Payment)
        app.post('/payment-checkout-session', async (req, res) => {
            const { applicationId, expectedSalary, tutorEmail, tutorName, subject, tuitionClass, tuitionId, studentEmail} = req.body;
            const amount = parseInt(expectedSalary) * 100;
            try {
                const session = await stripe.checkout.sessions.create({
                    line_items: [
                        {
                            price_data: {
                                currency: 'usd',
                                unit_amount: amount,
                                product_data: {
                                    name: `Tuition: ${subject} | Class : ${tuitionClass}`,
                                    description: `Tutor: ${tutorName} | Email: ${tutorEmail} `
                                }
                            },
                            quantity: 1,
                            },
                        ],
                    mode: 'payment',
                    metadata: { applicationId, tuitionId, tutorEmail },
                    customer_email: studentEmail,
                    success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                    cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
                });
                res.send({ url: session.url });
            } catch (error) {
                res.status(500).send({ error: "Failed to create checkout session" });
            }
        });

        // Verify payment success and approve tutor application
        app.patch('/payment-success', async (req, res) => {
            const sessionId = req.query.session_id;
            const session = await stripe.checkout.sessions.retrieve(sessionId);

            if (session.payment_status === 'paid') {
                const transactionId = session.payment_intent;
                const uniqueSessionId = session.id;

                const paymentExist = await paymentCollection.findOne({ sessionId: uniqueSessionId });
                if (paymentExist) {
                    return res.send(paymentExist) }

                const applicationId = session.metadata.applicationId;
                const tuitionId = session.metadata.tuitionId;
                const tutorEmail = session.metadata.tutorEmail;

                const application = await applyTuitionCollection.findOne({ _id: new ObjectId(applicationId) });
                const tuition = await tuitionCollection.findOne({ _id: new ObjectId(tuitionId) });

                const payment = {
                    amount: session.amount_total / 100,
                    currency: session.currency,
                    studentEmail: session.customer_email,
                    tutorEmail,
                    tutorName: application.tutorName,
                    subject: tuition.subject,
                    class: tuition.class,
                    paidAt: new Date(),
                    transactionId,
                    sessionId: uniqueSessionId, 
                    applicationId,
                    tuitionId,
                    paymentStatus: session.payment_status
                };

                await paymentCollection.insertOne(payment);
                await applyTuitionCollection.updateOne(
                    { _id: new ObjectId(applicationId) },
                    { $set: { status: "Approved", transactionId } }
                );

                return res.send(payment);
            }
            return res.send({ success: false });
        });

        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('eTuitionBd server is running!')
})

app.listen(port, () => {
    console.log(`eTuitionBd listening on port ${port}`)
})