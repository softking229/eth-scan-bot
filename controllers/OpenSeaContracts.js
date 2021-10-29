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
import OpenSeaContractLog from '../models/OpenSeaContractLog.js'
import OpenSeaLog from '../models/OpenSeaLog.js'
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

export const fetch_add_opensea_logs = async(params) => {
    let start = window.performance.now();
    params.module = "logs";
    params.action = "getLogs";
    params.address = opensea_address;
    params.topic0 = topic_orders_matched;
    const API_URL = process.env.API_URL;
    let last_scrapped_block = params.fromBlock * 1;
    const origin_from_block = last_scrapped_block;
    let transaction_count = 0;
    let opensea_logs;
    while(true) {
        params.fromBlock = last_scrapped_block;
        while( true) {
            try{
                const API_KEY = await wait_api_call_limit();
                params.apikey = API_KEY;
                let result = await axios.get(API_URL, {params}).catch(err => {
                    throw err;
                });
                opensea_logs = result.data.result;
                break;
            } catch(err) {
                console.log("Please check your network");
            }
        }
        for(const opensea_nft_tx of opensea_logs) {
            if( typeof(opensea_nft_tx) != "object")
                continue;
            // await addLog(opensea_nft_tx);
            if( last_scrapped_block < converter.hexToDec(opensea_nft_tx.blockNumber))
                last_scrapped_block = converter.hexToDec(opensea_nft_tx.blockNumber);
        }
        try {
            await OpenSeaContractLog.insertMany(opensea_logs, {ordered: false});
        } catch (error) {}
        transaction_count +=opensea_logs.length;
        if( opensea_logs.length < 1000)
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
            console.log(await fetch_add_opensea_logs(param));
            result.finished = true;
            await result.save();
            continue;
        } else {
            const {lastBlock:latestBlock} = await OnChainInfo.findOne();
            let fromBlock, toBlock = latestBlock;
            const mod = global.deviceNumber % 2;
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
            else if( fromBlock < 12500000)
                blockunit = 500;
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
                console.log(await fetch_add_opensea_logs(param));
                await OpenSeaDestributedInfo.updateOne({fromBlock: fromBlock}, {finished: true});
            }catch(err) {
                console.log(err.message);
                continue;
            }
        }
    }
}

export const getOpenseaLastBlockNumber = async() => {
    const result = await OpenSeaDestributedInfo.find({finished: true}).sort({fromBlock: -1}).limit(1);
    if( !result || !result.length)
        return -1;
    return result[0].toBlock;
}