import fs from 'fs-extra'
import mongoose from 'mongoose';
import dotenv from "dotenv";

dotenv.config({ silent: process.env.NODE_ENV === 'production' });

const DB_URL = process.env.DB_URL// || "mongodb://74.208.208.141:27017/onchain";
// Initialize DB connection
try {
    await mongoose.connect(DB_URL, {useNewUrlParser: true, useUnifiedTopology: true});
} catch (err) {
    console.log(err.message);
    //console.error("Please check MongoDB connection");
    process.exit(0);
}

let device_info = {"number":0};
if( fs.existsSync("device_info.json"))
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
    await mongoose.connection.db.dropCollection("openseacontractlogs");
    console.log("OpenSeaContractLogs removed");
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