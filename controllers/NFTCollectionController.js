import axios from 'axios'
import converter from 'hex2dec'
import util from 'util'
import { blockcypher_transaction_api } from '../consts.js'
import NFTCollection from '../models/NFTCollection.js'
import {getTotalDevices} from "./DeviceController.js"
import {getOnchainLatestBlockNumber, addTransaction, wait_api_call_limit} from "./TransactionController.js"

const Timer = util.promisify(setTimeout);

async function scrap_etherscan(page) {
    const { data: html } = await axios.get("https://etherscan.io/tokens-nft", {
        params: {
            p: page
        }
    })
    const urls = html.match(/(?<=token\/)0x[a-zA-Z0-9]+/g);
    //console.log(urls);
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
                    console.log("Please check your network");
                }
            }
            if( !logs.length) {
                continue;
            }
            let lastBlock = 0;
            let promise_array = [];
            let sublogs = logs.slice(0, 20);
            const unit = 20;
            let index = 0;
            while( index < logs.length) {
                let sublogs = logs.slice(index, unit);
                for( const log of sublogs) {
                    promise_array.push(getTransactionData(log));
                    if( lastBlock < converter.hexToDec(log.blockNumber))
                        lastBlock = converter.hexToDec(log.blockNumber);
                }
                index += unit;
            }
            await Promise.all(promise_array);
            if( logs.length >= 1000) 
                lastBlock --;
            let updating_collection = await NFTCollection.findOne({contractHash: nft_collection.contractHash});
            updating_collection.lastCheckedBlock = lastBlock;
            await updating_collection.save();
        }
    }
}

export const getTransactionData = async(log) => {
    if(await NFTCollection.exists({transactionHash: log.transactionHash}))
    {
        //console.log("already exist");
        return;
    }
    if( log.topics[2] === undefined)
        return;
    let transaction = {
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
        from: `0x${log.topics[2].substr(26)}`,
        to: `0x${log.topics[1].substr(26)}`,
        value: 0,
        timestamp: converter.hexToDec(log.timeStamp) * 1000,
        type: "trade",
        gasPrice: converter.hexToDec(log.gasPrice),
        gasUsed: converter.hexToDec(log.gasUsed)
    };
    if( log.topics[1] == "0x0000000000000000000000000000000000000000000000000000000000000000") {
        transaction.type = "mint";
    }
    else {
        let response;
    while(true) {
            try{
                response = await axios.get(blockcypher_transaction_api + log.transactionHash).catch(err => {
                    throw err;
                });
                break;
            } catch(err) {
                console.log("Please check your network");
            }
        }
        let result = response.data;
        transaction.value = 1.0 * result.total / (10 ^ 18);
    }
    await addTransaction(transaction);
    console.log("value:", transaction.value);
}