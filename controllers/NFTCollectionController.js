import axios from 'axios'
import converter from 'hex2dec'
import util from 'util'
import NFTCollection from '../models/NFTCollection.js'
import {getTotalDevices} from "./DeviceController.js"
import {getOnchainLatestBlockNumber, wait_api_call_limit, addLog} from "./TransactionController.js"

const Timer = util.promisify(setTimeout);

async function scrap_etherscan(page) {
    let html;
    while(true) {
        try {
            html = await axios.get("https://etherscan.io/tokens-nft", {
                params: {
                    p: page
                }
            }).catch(error => {
                throw error
            })
            break;
        } catch (error) {
            await Timer(1000);
            continue;
        }
    }
    const urls = html.data.match(/(?<=token\/)0x[a-zA-Z0-9]+/g);
    if( urls && urls.length)
        for( const url of urls) {
            try{
                await NFTCollection.create({contractHash: url, lastCheckedBlock: -1});
            } catch(err) {}
        }
    console.log("page: ", page);
    return urls?urls.length:0;
}

export const main = async() => {
    while(true) {
        const total_device_count = await getTotalDevices();
        let page = global.deviceNumber;
        const mod = page % total_device_count;
        while(true){
            let token_count = await scrap_etherscan(page);
            page += total_device_count;
            if(token_count == 0) break;
        }
        await Timer(10000);
    }
}

export const getLogsByNFTCollection = async() => {
    const API_URL = process.env.API_URL;
    while(true) {
        const total_device_count = await getTotalDevices();
        const mod = global.deviceNumber % total_device_count;
        const latestBlock = await getOnchainLatestBlockNumber();
        const nft_collections = await NFTCollection.aggregate([
            {
                "$addFields": {
                    "isNotLatest": {
                        "$ne": [
                            "$lastCheckedBlock", latestBlock
                        ]
                    },
                    "mod": {
                        "$mod": [
                            "$_id", total_device_count
                        ]
                    }
                }
            },
            {
                "$match": { 
                    "$and": [
                        {"mod": mod},
                        {"isNotLatest": true}
                    ]
                }
            }
        ]).exec();
        if( !nft_collections.length) {
            await Timer(1000);
            continue;
        }
        for( const nft_collection of nft_collections) {
            let params = {
                module: "logs",
                action: "getLogs",
                address: nft_collection.contractHash,
                fromBlock: nft_collection.lastCheckedBlock + 1,
                toBlock: latestBlock,
            }
            const API_KEY = await wait_api_call_limit();
            Object.assign(params, {apikey: API_KEY});
            let logs = [];
            while(true) {
                try{
                    let result = await axios.get(API_URL, {params}).catch(err => {
                        throw err;
                    });
                    if(result.data.status != "1")
                        continue;
                    logs = result.data.result; 
                    break;
                } catch(err) {
                    console.log(err.message, "getLogsByNFTCollection");
                    await Timer(1000);
                }
            }
            if( !logs.length) {
                continue;
            }
            let lastBlock = 0;
            const unit = 3;
            let index = 0;
            let sublogs = [];
            while( index < logs.length) {
                let promise_array = [];
                sublogs = logs.slice(index, unit + index);
                for( const log of sublogs) {
                    if( lastBlock < converter.hexToDec(log.blockNumber))
                        lastBlock = converter.hexToDec(log.blockNumber);
                    promise_array.push(addLog(log));
                }
                await Promise.all(promise_array);
                index += unit;
            }
            if( logs.length >= 1000) 
                lastBlock --;
            else
                lastBlock = latestBlock;
            let updating_collection = await NFTCollection.findOne({contractHash: nft_collection.contractHash});
            if( updating_collection == null) {
                updating_collection = new NFTCollection();
                updating_collection.lastCheckedBlock = lastBlock;
                updating_collection.contractHash = nft_collection.contractHash;
            }
            updating_collection.lastCheckedBlock = lastBlock;
            await updating_collection.save();
        }

        await Timer(1000);
    }
}