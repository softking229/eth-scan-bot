import express from 'express'
import morgan from 'morgan'
import routes from './routes/index.js'
import dotenv from "dotenv";

dotenv.config({ silent: process.env.NODE_ENV === 'production' });

// Initialize DB connection
// try {
//     await mongoose.connect(process.env.DB_URL, {useNewUrlParser: true, useUnifiedTopology: true});
//     console.log(process.env.DB_URL, "connected");
// } catch (err) {
//     console.error("Please check MongoDB connection");
//     process.exit();
// }


// Setup Express
const app = express();
const PORT = process.env.PORT || 80;

// Express Logger Middleware
app.use(morgan('combined'));
app.use('/', routes);

app.listen(PORT, () => {
    console.log(`app listening at http://localhost:${PORT}`)
});