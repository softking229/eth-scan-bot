import axios from 'axios'
import converter from 'hex2dec'
import abiDecoder from '../utils/abi-decoder.js'
import util from 'util'
import { etherscan_apikeys, opensea_api } from '../consts.js'
import TransactionHistory from '../models/TransactionHistory.js'
import WatchList from '../Models/WatchList.js'
import NFTCollection from '../models/NFTCollection.js'
import { JSDOM } from "jsdom"
import {getTotalDevices} from "./DeviceController.js"
import {getOnchainLatestBlockNumber, addTransaction} from "./TransactionController.js"
const { window } = new JSDOM()

const Timer = util.promisify(setTimeout);

async function scrap_etherscan(page) {
    const { data: html } = await axios.get("https://etherscan.io/tokens-nft", {
        params: {
            p: page
        }
    })
    const urls = html.match(/(?<=token\/)0x[a-zA-Z0-9]+/g);
    console.log(urls);
    urls.forEach(url => {
        NFTCollection.create({contractHash: url, lastCheckedBlock: -1});
    });
    console.log("page: ", page);
    return urls.length;
}

export const main = async() => {
    while(true) {
        let page = global.deviceNumber;
        const mod = page % (await getTotalDevices());
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
        const mod = global.deviceNumber % (await getTotalDevices());
        const latestBlock = await getOnchainLatestBlockNumber();
        const nft_collections = await NFTCollection.aggregate([
            {"$match": {"mod": mod, "isUpdated": false}},
            {"$addFields": {"isLatest": {"$ne": ["lastCheckedBlock", latestBlock]}}}
        ]).exec();
        if( !nft_collections.length) {
            await Timer(1000);
            continue;
        }
        nft_collections.forEach(nft_collection => {
            let params = {
                module: "logs",
                action: "getLogs",
                address: nft_collection.contractHash,
                fromBlock: nft_collection.lastCheckedBlock + 1,
                toBlock: latestBlock,
            }
            const API_KEY = await wait_api_call_limit();
            Object.assign(params, {apikey: API_KEY});
            let logs
            while(true) {
                try{
                    let result = await axios.get(API_URL, {params}).catch(err => {
                        throw err;
                    });
                    logs = result.data.result;
                    break;
                } catch(err) {
                    console.log("Please check your network");
                }
            }
            if( !logs.length) {
                continue;
            }
            logs.forEach(log => {

            });
        })
    }
}

export const getTokenNFTtx_byWallet = async() => {
    while(true) {
        const mod = global.deviceNumber % (await getTotalDevices());
        const latestBlock = await getOnchainLatestBlockNumber();
        const wallets = await WatchList.aggregate([
            {"$match": {"mod": mod, "isUpdated": false}}]).exec();
        if( !wallets.length) {
            await Timer(1000);
            continue;
        }
        wallets.forEach(wallet => {
            
        })
    }
}