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
        const paymentCollection = db.collection('payments');

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
            user.status = "Active"
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        // latest tuition posts for homepage
        app.get('/latest-tuitions', async (req, res) => {
            const result = await tuitionCollection.find({status: "Approved"}).sort({ createdAt: -1 }).limit(4).toArray();
            res.send(result);
        });

        // Get single tuition post(Details page)
        app.get('/tuition/:id', async (req, res) => {
            const id = req.params.id;
            const result = await tuitionCollection.findOne({ _id: new ObjectId(id) });
            res.send(result);
        });


        // All tuition get api
        app.get('/all-tuitions', async (req, res) => {
            const result = await tuitionCollection.find({status: "Approved"}).sort({createdAt: -1}).toArray();
            res.send(result);
        });

        // Jamela ache
        // app.get('/all-tuitions', async (req, res) => {
        //     const search = req.query.search || "";
        //     const query = {
        //         status: "Approved",
        //     $or: [
        //         { subject: { $regex: search, $options: "i" } },
        //         { location: { $regex: search, $options: "i" } }
        //     ]
        //     };
        //     const result = await tuitionCollection.find(query).sort({createdAt: -1}).toArray();
        //     res.send(result);
        // });

        // latest-tutors get api for homepage
        app.get('/latest-tutors', async (req, res) => {
            const result = await userCollection.find({ role: 'Tutor' }).sort({ createdAt: -1 }).limit(4).toArray();
            res.send(result);
        }); 

        // All tutors get api
        app.get('/all-tutors', async (req, res) => {
            const result = await userCollection.find({ role: 'Tutor' }).sort({createdAt: -1}).toArray();
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

        // get all tuition post by student email
        app.get('/my-tuitions', async (req, res) => {
            const email = req.query.email;
            const query = {
                studentEmail: email,
                status: "Approved"
            };

            const result = await tuitionCollection.find(query).sort({ createdAt: -1 }).toArray();
            res.send(result);
        });


        // delete tuition post by id
        app.delete('/tuition/:id', async (req, res) => {
            const id = req.params.id;
            const result = await tuitionCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // Update tuition post by id
        app.patch('/tuition/:id', async (req, res) => {
            const id = req.params.id;
            const updatedTuition = req.body;

            if (updatedTuition._id) { delete updatedTuition._id;}

            const query = { _id: new ObjectId(id) };
            const update = { $set: updatedTuition };

            try { const result = await tuitionCollection.updateOne(query, update);
                res.send(result);
            } catch (error) { res.status(500).send({ error: "Failed to update tuition post" });}
        });

        // Apply for a tuition post
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


// Get all applications for a specific tuition post
        app.get('/applications/student/:email', async (req, res) => {
            const studentEmail = req.params.email;

            try { const result = await applyTuitionCollection.aggregate([
                { $lookup: { from: "tuitions", localField: "tuitionId",  foreignField: "_id", as: "tuitionInfo" }},
                { $unwind: "$tuitionInfo" },
                { $match: { "tuitionInfo.studentEmail": studentEmail, "tuitionInfo.status": "Approved" } }
                ]).toArray();

                res.send(result);
            } catch (error) {
                console.error("Error fetching applications:", error);
                res.status(500).send({ error: "Failed to fetch applications" });
            }
        });


    // Tutor related APIs
        // Get all applications by tutor email
        app.get('/my-applications/tutor/:email', async (req, res) => {
            const tutorEmail = req.params.email;
            const result = await applyTuitionCollection.find({ tutorEmail: tutorEmail }).sort({appliedAt: -1}).toArray();
            res.send(result);
        });

        // Update application (only if not approved)
        app.patch('/applications/:id', async (req, res) => {
            const id = req.params.id;
            const updateData = req.body;
            const result = await applyTuitionCollection.updateOne(
                { _id: new ObjectId(id), status: { $ne: "Approved" } },
                { $set: updateData }
            );
            res.send(result);
        });

        // Delete application (only if not approved)
        app.delete('/applications/:id', async (req, res) => {
            const id = req.params.id;
            const result = await applyTuitionCollection.deleteOne({ _id: new ObjectId(id), status: { $ne: "Approved" } });
            res.send(result);
        });

        // Ongoing tuitions for a tutor
        app.get('/tuitions/ongoing/:email', async (req, res) => {
            const tutorEmail = req.params.email;
            try {
            const ongoingTuitions = await applyTuitionCollection.find({ tutorEmail: tutorEmail, status: "Approved" }).toArray();
            res.send(ongoingTuitions);
            } catch (err) {
                console.error(err);
            res.status(500).send({ error: "Failed to fetch ongoing tuitions" });
            }
        });

        // Revenue details for a tutor
        app.get('/revenue/:tutorEmail', async (req, res) => {
            const tutorEmail = req.params.tutorEmail;
            const payments = await paymentCollection.find({ tutorEmail }).toArray();
            res.send(payments);
        });

    // Admin related APIs can be added here...
        // User Management Page (Get all users)
        app.get('/users', async (req, res) => {
            const result = await userCollection.find({}).sort({createdAt: -1}).toArray();
            res.send(result);
        });

        // Update user info (Admin only)
        app.patch('/users/:id', async (req, res) => {
            const id = req.params.id;
            const updateData = req.body;
            const result = await userCollection.updateOne( { _id: new ObjectId(id) }, { $set: updateData })
            res.send(result);
        });

        // Delete user account (Admin only)
        app.delete('/users/:id', async (req, res) => {
                const id = req.params.id;
                const result = await userCollection.deleteOne({ _id: new ObjectId(id) });
                res.send(result);
        });

        // Tuition Management page
        // Get all pending tuition posts (Admin review)
        app.get('/tuitions/pending', async (req, res) => {
            const result = await tuitionCollection.find({ status: "Pending" }).sort({ createdAt: -1 }).toArray();
            res.send(result);
        });

        // Update tuition status (Approve / Reject)
        app.patch('/tuitions/:id', async (req, res) => {
            const id = req.params.id;
            const { status } = req.body; // "Approved" or "Rejected"
            const result = await tuitionCollection.updateOne( 
                { _id: new ObjectId(id) }, 
                { $set: { status } }
            );
            res.send(result);
        })

        // Dashboard role condition check
        app.get('/users/:email/role', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await userCollection.findOne(query);
            res.send({ role: user?.role || 'user' })
        })

        // Create Stripe checkout session for tutor application
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
                    console.error(error);
                    res.status(500).send({ error: "Failed to create checkout session" });
            }
        });

        // Admin dashboard stats
        app.get('/admin/stats', async (req, res) => {
            try {
            const userPipeline = [
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ];
            const userStats = await userCollection.aggregate(userPipeline).toArray();

            const rolePipeline = [
                {
                    $group: {
                        _id: '$role',
                        count: { $sum: 1 }
                    }
                }
            ];
            const roleStats = await userCollection.aggregate(rolePipeline).toArray();

            // Tuition posts stats
            const tuitionPipeline = [
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ];
            const tuitionStats = await tuitionCollection.aggregate(tuitionPipeline).toArray();

            // Total tuition posts
            const totalTuitions = await tuitionCollection.countDocuments();
            res.send({ userStats, roleStats, tuitionStats, totalTuitions });
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to fetch admin stats" });
            }
        });

        // Reports & Analytics API
        app.get('/admin/reports', async (req, res) => {
        try {
            const totalEarningsAgg = await paymentCollection.aggregate([
                { $match: { 
                    paymentStatus: 'paid' 
                    }
                },
                { $group: {
                    _id: null, 
                    total: { $sum: '$amount' } } 
                }
            ]).toArray();
            const totalEarnings = totalEarningsAgg[0]?.total || 0;

            const transactions = await paymentCollection.find({ paymentStatus: 'paid' }).sort({ paidAt: -1 }).toArray();
            res.send({ totalEarnings, transactions });
        } catch (err) {
            console.error(err);
            res.status(500).send({ error: 'Failed to fetch reports' });
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
      return res.send(paymentExist);
    }

    
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
    res.send('eTuitionBd is shifting shifting!')
})

app.listen(port, () => {
    console.log(`eTuitionBd listening on port ${port}`)
})