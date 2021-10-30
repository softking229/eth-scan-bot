import mongoose from 'mongoose';
import autoIncrement from 'mongoose-auto-increment'
import express from 'express'
import morgan from 'morgan'
import dotenv from "dotenv";
import routes from './routes/index.js'
import {checkDeviceInfo} from './controllers/DeviceController.js'
import {getOnchainLatestBlocknumber, fetch_latest_blocknumber, set_api_keys } from './controllers/TransactionController.js'
import util from 'util'
import { getOpenSeaLogs } from './controllers/OpenSeaContracts.js'
import { main as getNFTCollectionList, getLogsByNFTCollection} from './controllers/NFTCollectionController.js'
import { exit } from 'process';
import Log from './models/Log.js';

const Timer = util.promisify(setTimeout);

dotenv.config({ silent: process.env.NODE_ENV === 'production' });

const DB_URL = process.env.DB_URL// || "mongodb://74.208.208.141:27017/onchain";
// Initialize DB connection
try {
    await mongoose.connect(DB_URL, {useNewUrlParser: true, useUnifiedTopology: true});
    autoIncrement.initialize(mongoose.connection);
} catch (err) {
    console.log(err.message);
    process.exit(0);
}

global.fetch_transaction_pending = [];
global.deviceNumber = await checkDeviceInfo();
set_api_keys();

await fetch_latest_blocknumber();

getNFTCollectionList();
//getLogsByNFTCollection();
//getLogsByNFTCollection();
//getOpenSeaLogs();

if( global.deviceNumber == 1) {
    // Setup Express
    const app = express();
    const PORT = process.env.PORT || 80;

    // Express Logger Middleware
    app.use(morgan('combined'));
    app.use('/', routes);

    // app.listen(PORT, () => {
    //     console.log(`app listening at http://localhost:${PORT}`)
    // });
    getOnchainLatestBlocknumber();
}