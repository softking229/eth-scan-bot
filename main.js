import mongoose from 'mongoose';
import express from 'express'
import morgan from 'morgan'
import routes from './routes/index.js'
import dotenv from "dotenv";
import { opensea_address, topic_orders_matched, opensea_origin_start_block } from './consts.js';
import OnChainInfo from './Models/OnChainInfo.js'
import {checkDeviceInfo} from './controllers/DeviceController.js'
import {fetch_transactions, getOnchainLatestBlocknumber} from './controllers/TransactionController.js'
import OpenSeaDestributedInfo from './models/OpenSeaDestributedInfo.js'
import util from 'util'
import { exit } from 'process';
import { exists } from 'fs';

const Timer = util.promisify(setTimeout);

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

const deviceNumber = await checkDeviceInfo();

getOnchainLatestBlocknumber();

while( true) {
    const result = await OpenSeaDestributedInfo.findOne({deviceNumber: deviceNumber, finished: false});
    let param = {
        module: "logs",
        action: "getLogs",
        address: opensea_address,
        topic0: topic_orders_matched,
        fromBlock: 0,
        toBlock: 'latest',
    }
    if( result) {
        param.fromBlock = result.fromBlock;
        param.toBlock = result.toBlock;
        console.log(await fetch_transactions(param));
        result.finished = true;
        await result.save();
        continue;
    } else {
        let addFields = { "$addFields": { "mod": { "$mod": ["$deviceNumber", 2] } } };
        let match = { "$match": {"mod": 1, finished: false} };
        let sort = { "$sort": {blockNumber: 1}};
        let limit = { "$limit": 1 };
        const mod = deviceNumber % 2;
        let fromBlock, toBlock;
        const {lastBlock:latestBlock} = await OnChainInfo.findOne();
        const downingTopBlockRange = await OpenSeaDestributedInfo.aggregate([addFields,
                                                                            {"$match": {"mod": 0}},
                                                                            { "$sort": {fromBlock: -1}},
                                                                            limit]).exec();
        const downingBottomBlockRange = await OpenSeaDestributedInfo.aggregate([addFields,
                                                                                {"$match": {"mod": 0}},
                                                                                { "$sort": {fromBlock: 1}},
                                                                                limit]).exec();
        const upingTopBlockRange = await OpenSeaDestributedInfo.aggregate([addFields,
                                                                            {"$match": {"mod": 1}},
                                                                            { "$sort": {fromBlock: -1}},
                                                                            limit]).exec();
        fromBlock = opensea_origin_start_block;
        toBlock = latestBlock;
        if( upingTopBlockRange.length) {
            fromBlock = upingTopBlockRange[0].toBlock + 1;
        }
        if( downingTopBlockRange.length) {
            let earsePart = {down: downingBottomBlockRange[0].fromBlock, up: downingTopBlockRange[0].toBlock};
            if( earsePart.up < fromBlock) {
            } else if( earsePart.down > toBlock){}
            else if( earsePart.down <= fromBlock) {
                if( earsePart.up >= toBlock) {
                    fromBlock = 0;
                    toBlock = -1;
                } else {
                    fromBlock = earsePart.up + 1;
                }
            } else {
                if( earsePart.up >= toBlock) {
                    toBlock = earsePart.down - 1;
                } else{
                    if( mod) toBlock = earsePart.down - 1;
                    else {
                        fromBlock = earsePart.up + 1;
                    }
                }
            }
        }
        if( !mod) {
            if( fromBlock <= toBlock - 100)
                fromBlock = toBlock - 100 + 1;
        }
        else if( toBlock >= fromBlock + 100 - 1)
            toBlock = fromBlock + 100 - 1;
        // if( !mod){
        //     fromBlock = downingTopBlockRange.length
        //                 ?(downingTopBlockRange[0].toBlock < latestBlock
        //                     ?downingTopBlockRange[0].toBlock + 1
        //                     :(upingTopBlockRange.length
        //                         ?upingTopBlockRange[0].toBlock + 1
        //                         :opensea_origin_start_block))
        //                 :(upingTopBlockRange.length
        //                     ?upingTopBlockRange[0].toBlock + 1
        //                     :opensea_origin_start_block);
        //     toBlock = downingTopBlockRange.length
        //                 ?(downingTopBlockRange[0].toBlock<latestBlock
        //                     ?latestBlock
        //                     :downingBottomBlockRange[0].fromBlock - 1)
        //                 :latestBlock;
        //     if( fromBlock <= toBlock - 100)
        //         fromBlock = toBlock - 100 + 1;
        // } else {
        //     fromBlock = upingTopBlockRange.length
        //                     ?(!downingBottomBlockRange.length
        //                         ?upingTopBlockRange[0].toBlock + 1
        //                         :(downingBottomBlockRange[0].fromBlock<=upingTopBlockRange[0].toBlock
        //                             ?downingTopBlockRange[0].toBlock + 1
        //                             :upingTopBlockRange[0].toBlock + 1))
        //                     :(downingBottomBlockRange.length
        //                         ?(downingBottomBlockRange[0].fromBlock <= opensea_origin_start_block
        //                             ?downingTopBlockRange[0].toBlock + 1
        //                             :opensea_origin_start_block)
        //                         :opensea_origin_start_block);
        //     toBlock = downingBottomBlockRange.length
        //                     ?(downingBottomBlockRange[0].fromBlock <= opensea_origin_start_block
        //                         ?latestBlock
        //                         :downingBottomBlockRange[0].fromBlock - 1)
        //                     :latestBlock;
        //     if( toBlock >= fromBlock + 100 - 1)
        //         toBlock = fromBlock + 100 - 1;
        // }
        if ( fromBlock > toBlock) {
            await Timer(1000);
            continue;
        }
        try{
            await OpenSeaDestributedInfo.create({
                fromBlock: fromBlock,
                toBlock: toBlock,
                finished: false,
                deviceNumber: deviceNumber});
            param.fromBlock = fromBlock;
            param.toBlock = toBlock;
            console.log(await fetch_transactions(param));
            await OpenSeaDestributedInfo.updateOne({fromBlock: fromBlock}, {finished: true});
            continue;
        }catch(err) {
            continue;
        }
    }
}

// // Setup Express
// const app = express();
// const PORT = process.env.PORT || 80;

// // Express Logger Middleware
// app.use(morgan('combined'));
// app.use('/', routes);

// app.listen(PORT, () => {
//     console.log(`app listening at http://localhost:${PORT}`)
// });