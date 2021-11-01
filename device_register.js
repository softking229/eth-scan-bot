import mongoose from 'mongoose';
import autoIncrement from 'mongoose-auto-increment'
import dotenv from "dotenv";
import {checkDeviceInfo} from './controllers/DeviceController.js'
import util from 'util'

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

global.deviceNumber = await checkDeviceInfo();
console.log("finished");
process.exit(0);