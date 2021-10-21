import mongoose from 'mongoose';
import express from 'express'
import morgan from 'morgan'
import routes from './routes/index.js'
import dotenv from "dotenv";

dotenv.config({ silent: process.env.NODE_ENV === 'production' });

const DB_URL = process.env.DB_URL || "mongodb://localhost:27017";
// Initialize DB connection
try {
    await mongoose.connect(DB_URL, {useNewUrlParser: true, useUnifiedTopology: true});
} catch (err) {
    console.log(err.message);
    //console.error("Please check MongoDB connection");
    process.exit(0);
}


// Setup Express
const app = express();
const PORT = process.env.PORT || 80;

// Express Logger Middleware
app.use(morgan('combined'));
app.use('/', routes);

app.listen(PORT, () => {
    console.log(`app listening at http://localhost:${PORT}`)
});