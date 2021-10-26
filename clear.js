import fs from 'fs-extra'
import mongoose from 'mongoose';
import dotenv from "dotenv";
import NFTCollection from './models/NFTCollection.js'
import OnChainInfo from './models/OnChainInfo.js'
import OpenSeaDestributedInfo from './models/OpenSeaDestributedInfo.js'
import OpenSeaDeviceInfo from './models/OpenSeaDeviceInfo.js'
import TransactionHistory from './models/TransactionHistory.js'
import WatchList from './models/WatchList.js'
import OpenSeaContractLog from './models/OpenSeaContractLog.js'
import Log from './models/Log.js'

dotenv.config({ silent: process.env.NODE_ENV === 'production' });

const DB_URL = process.env.DB_URL || "mongodb://74.208.208.141:27017/onchain";
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
    await mongoose.connection.db.dropCollection("logs");
    console.log("Log removed");
}catch(err){}
try {
    await mongoose.connection.db.dropCollection("nftcollections");
    console.log("NFTCollection removed");
}catch(err){}
try {
    await mongoose.connection.db.dropCollection("onchaininfos");
    console.log("OnChainInfo removed");
}catch(err){}
try {
    await mongoose.connection.db.dropCollection("openseadestributedinfos");
    console.log("OpenSeaDestributedInfo removed");
}catch(err){}
try {
    await mongoose.connection.db.dropCollection("openseadeviceinfos");
    console.log("OpenSeaDeviceInfo removed");
}catch(err){}
try {
    await mongoose.connection.db.dropCollection("transactionhistories");
    console.log("TransactionHistory removed");
}catch(err){}
try {
    await mongoose.connection.db.dropCollection("watchlists");
    console.log("WatchList removed");
}catch(err){}

console.log("finished");
process.exit(0);