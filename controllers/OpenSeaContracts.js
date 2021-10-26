import fs from 'fs-extra'
import axios from 'axios'
import OpenSeaDeviceInfo from '../models/OpenSeaDeviceInfo.js'
import OpenSeaDestributedInfo from '../models/OpenSeaDestributedInfo.js'
import OnChainInfo from '../models/OnChainInfo.js'
import {wait_api_call_limit, addLog} from './TransactionController.js'
import { opensea_address, topic_orders_matched, opensea_origin_start_block } from '../consts.js';
import converter from 'hex2dec'
import abiDecoder from '../utils/abi-decoder.js'
import util from 'util'
import { JSDOM } from "jsdom"
import { allowedNodeEnvironmentFlags } from 'process'
const { window } = new JSDOM()
const Timer = util.promisify(setTimeout);

export const checkDeviceInfo = async() => {
    let device_info = fs.readJsonSync("device_info.json");
    if( device_info.number == 0) {
        let success = false;
        while( !success) {
            const result = await OpenSeaDeviceInfo.find({}).sort({LastDeviceNumber: -1}).limit(1);
            let lastDeviceNumber = 1;
            if( result.length) {
                lastDeviceNumber = result[0].LastDeviceNumber + 1;
            }
            try {
                await OpenSeaDeviceInfo.create({LastDeviceNumber: lastDeviceNumber});
                device_info.number = lastDeviceNumber;
                fs.writeJsonSync("device_info.json", device_info);
                success = true;
            } catch (error) {}
        }
    }
    return device_info.number;
}

export const fetch_transactions = async(params) => {
    let start = window.performance.now();
    const API_URL = process.env.API_URL;
    const API_KEY = await wait_api_call_limit();
    let last_scrapped_block = params.fromBlock * 1;
    const origin_from_block = last_scrapped_block;
    let transaction_count = 0;
    Object.assign(params, {apikey: API_KEY});
    let opensea_nft_tx_list;
    while(true) {
        params.fromBlock = last_scrapped_block;
        while( true) {
            try{
                let result = await axios.get(API_URL, {params}).catch(err => {
                    throw err;
                });
                opensea_nft_tx_list = result.data.result;
                break;
            } catch(err) {
                console.log("Please check your network");
            }
        }
        for(const opensea_nft_tx of opensea_nft_tx_list) {
            if( typeof(opensea_nft_tx) != "object")
                continue;
            addLog(opensea_nft_tx);
            if( last_scrapped_block < converter.hexToDec(opensea_nft_tx.blockNumber))
                last_scrapped_block = converter.hexToDec(opensea_nft_tx.blockNumber);
        }
        transaction_count +=opensea_nft_tx_list.length;
        if( opensea_nft_tx_list.length < 1000)
            break;
    }
    let end = window.performance.now();
    console.log(`Execution time: ${end - start} ms`);
    return {
        fromBlock: origin_from_block,
        count: transaction_count,
        toBlock: params.toBlock
    };
};

export const getOpenSeaLogs = async() => {
    while( true) {
        const result = await OpenSeaDestributedInfo.findOne({deviceNumber: global.deviceNumber, finished: false});
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
            const {lastBlock:latestBlock} = await OnChainInfo.findOne();
            let fromBlock, toBlock = latestBlock;
            const mod = global.deviceNumber % 2;
            // let addFields = { "$addFields": { "mod": { "$mod": ["$deviceNumber", 2] } } };
            // let match = { "$match": {"mod": 1, finished: false} };
            // let sort = { "$sort": {blockNumber: 1}};
            // let limit = { "$limit": 1 };
            // const downingTopBlockRange = await OpenSeaDestributedInfo.aggregate([addFields,
            //                                                                     {"$match": {"mod": 0}},
            //                                                                     { "$sort": {fromBlock: -1}},
            //                                                                     limit]).exec();
            // const downingBottomBlockRange = await OpenSeaDestributedInfo.aggregate([addFields,
            //                                                                         {"$match": {"mod": 0}},
            //                                                                         { "$sort": {fromBlock: 1}},
            //                                                                         limit]).exec();
            // const upingTopBlockRange = await OpenSeaDestributedInfo.aggregate([addFields,
            //                                                                     {"$match": {"mod": 1}},
            //                                                                     { "$sort": {fromBlock: -1}},
            //                                                                     limit]).exec();
            // fromBlock = opensea_origin_start_block;
            // toBlock = latestBlock;
            // if( upingTopBlockRange.length) {
            //     fromBlock = upingTopBlockRange[0].toBlock + 1;
            // }
            // if( downingTopBlockRange.length) {
            //     let earsePart = {down: downingBottomBlockRange[0].fromBlock, up: downingTopBlockRange[0].toBlock};
            //     if( earsePart.up < fromBlock) {
            //     } else if( earsePart.down > toBlock){}
            //     else if( earsePart.down <= fromBlock) {
            //         if( earsePart.up >= toBlock) {
            //             fromBlock = 0;
            //             toBlock = -1;
            //         } else {
            //             fromBlock = earsePart.up + 1;
            //         }
            //     } else {
            //         if( earsePart.up >= toBlock) {
            //             toBlock = earsePart.down - 1;
            //         } else{
            //             if( mod) toBlock = earsePart.down - 1;
            //             else {
            //                 fromBlock = earsePart.up + 1;
            //             }
            //         }
            //     }
            // }
            // let blockunit = 100;
            // if( toBlock < 10000000)
            //     blockunit = 1000;
            // if( !mod) {
            //     if( fromBlock <= toBlock - blockunit)
            //         fromBlock = toBlock - blockunit + 1;
            // }
            // else{
            //     if( toBlock >= fromBlock + blockunit - 1)
            //         toBlock = fromBlock + blockunit - 1;
            // }
            const downingTopBlockRange = await OpenSeaDestributedInfo.find({}).sort({toBlock: -1}).limit(1).exec();
            if( downingTopBlockRange.length)
                fromBlock = downingTopBlockRange[0].toBlock + 1;
            else
                fromBlock = opensea_origin_start_block;
            let blockunit = 100;
            if( fromBlock < 10000000)
                blockunit = 10000;
            else if( fromBlock < 11000000)
                blockunit = 5000;
            else if( fromBlock < 11500000)
                blockunit = 1000;
            if( fromBlock <= toBlock - blockunit)
                toBlock = fromBlock + blockunit - 1;
            
            console.log(fromBlock, toBlock);
            if ( fromBlock > toBlock) {
                await Timer(1000);
                continue;
            }
            try{
                await OpenSeaDestributedInfo.create({
                    fromBlock: fromBlock,
                    toBlock: toBlock,
                    finished: false,
                    deviceNumber: global.deviceNumber});
                param.fromBlock = fromBlock;
                param.toBlock = toBlock;
                console.log(await fetch_transactions(param));
                await OpenSeaDestributedInfo.updateOne({fromBlock: fromBlock}, {finished: true});
                continue;
            }catch(err) {
                console.log(err.message);
                continue;
            }
        }
    }
}