import fs from 'fs-extra'
import mongoose from 'mongoose';
import dotenv from "dotenv";
import OpenSeaDeviceInfo from './models/OpenSeaDeviceInfo.js'

dotenv.config({ silent: process.env.NODE_ENV === 'production' });

const DB_URL = "mongodb://localhost:27017/onchain";
// Initialize DB connection
try {
    await mongoose.connect(DB_URL, {useNewUrlParser: true, useUnifiedTopology: true});
} catch (err) {
    console.log(err.message);
    //console.error("Please check MongoDB connection");
    process.exit(0);
}

let device_info = fs.readJsonSync("device_info.json");
device_info = {"number":0};
fs.writeJsonSync("device_info.json", device_info);

try {
    await mongoose.connection.db.dropCollection("openseadeviceinfos");
}catch(err){}

console.log("finished");
process.exit(0);