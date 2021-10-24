import mongoose from 'mongoose';
import autoIncrement from 'mongoose-auto-increment'
import express from 'express'
import morgan from 'morgan'
import routes from './routes/index.js'
import dotenv from "dotenv";
import {checkDeviceInfo} from './controllers/DeviceController.js'
import {getOnchainLatestBlocknumber} from './controllers/TransactionController.js'
import util from 'util'
import { exit } from 'process';
import { getOpenSeaLogs } from './controllers/OpenSeaContracts.js'
import { main as getNFTCollectionList, getLogsByNFTCollection} from './controllers/NFTCollectionController.js'


const Timer = util.promisify(setTimeout);

dotenv.config({ silent: process.env.NODE_ENV === 'production' });

const DB_URL = process.env.DB_URL || "mongodb://localhost:27017";
// Initialize DB connection
try {
    await mongoose.connect(DB_URL, {useNewUrlParser: true, useUnifiedTopology: true});
    autoIncrement.initialize(mongoose.connection);
} catch (err) {
    console.log(err.message);
    //console.error("Please check MongoDB connection");
    process.exit(0);
}

global.deviceNumber = await checkDeviceInfo();

if( global.deviceNumber == 1)
    getOnchainLatestBlocknumber();

getNFTCollectionList();
getLogsByNFTCollection();
getOpenSeaLogs();

// // Setup Express
// const app = express();
// const PORT = process.env.PORT || 80;

// // Express Logger Middleware
// app.use(morgan('combined'));
// app.use('/', routes);

// app.listen(PORT, () => {
//     console.log(`app listening at http://localhost:${PORT}`)
// });