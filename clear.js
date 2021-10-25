import fs from 'fs-extra'
import mongoose from 'mongoose';
import dotenv from "dotenv";
import NFTCollection from './models/NFTCollection.js'
import OnChainInfo from './Models/OnChainInfo.js'
import OpenSeaDestributedInfo from './Models/OpenSeaDestributedInfo.js'
import OpenSeaDeviceInfo from './Models/OpenSeaDeviceInfo.js'
import TransactionHistory from './models/TransactionHistory.js'
import WatchList from './Models/WatchList.js'
import OpenSeaContractLog from './models/OpenSeaContractLog.js'

dotenv.config({ silent: process.env.NODE_ENV === 'production' });

const DB_URL = process.env.DB_URL || "mongodb://74.208.208.141:27017";
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

await NFTCollection.deleteMany();
console.log("NFTCollection removed");
await OnChainInfo.deleteMany();
console.log("OnChainInfo removed");
await OpenSeaContractLog.deleteMany();
console.log("OpenSeaContractLog removed");
await OpenSeaDestributedInfo.deleteMany();
console.log("OpenSeaDestributedInfo removed");
await OpenSeaDeviceInfo.deleteMany();
console.log("OpenSeaDeviceInfo removed");
await TransactionHistory.deleteMany();
console.log("TransactionHistory removed");
await WatchList.deleteMany();
console.log("WatchList removed");

console.log("finished");
process.exit(0);