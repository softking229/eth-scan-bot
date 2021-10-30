import axios from 'axios'
import converter from 'hex2dec'
import util from 'util'
import NFTCollection from '../models/NFTCollection.js'
import {getTotalDevices} from "./DeviceController.js"
import {getOnchainLatestBlockNumber, wait_api_call_limit, addLog} from "./TransactionController.js"
import TransactionHistory from '../models/TransactionHistory.js'
import { topic1_mint } from '../consts.js'
import { addWalletInfoToWatchList } from './TransactionController.js'
import OpenSeaLog from '../models/OpenSeaLog.js'
import {getOpenseaLastBlockNumber} from './OpenSeaContracts.js'

const Timer = util.promisify(setTimeout);

async function scrap_etherscan(page) {
    const API_URL = process.env.API_URL;
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
            console.log(error.message, "in scrapping token-nft page");
            await Timer(1000);
            continue;
        }
    }
    const urls = html.data.match(/(?<=token\/)0x[a-zA-Z0-9]+/g);
    if( urls && urls.length)
        for( const url of urls) {
            try{
                let nftCollection = new NFTCollection({contractHash: url, lastCheckedBlock: -1});
                await nftCollection.save();
                let logs;
                let params = {
                    module: "logs",
                    action: "getLogs",
                    address: nftCollection.contractHash,
                    fromBlock: 0,
                    toBlock: "latest"
                };
                params.apikey = await wait_api_call_limit();
                while(true) {
                    try{
                        let result = await axios.get(API_URL, {params}).catch(err => {
                            throw err;
                        });
                        logs = result.data.result;
                        if( result.data.status != "1")
                            continue;
                        break;
                    } catch(err) {
                        console.log(err.message, "calling api in scrap_etherscan");
                    }
                }
                nftCollection.firstBlock = converter.hexToDec(logs[0].blockNumber);
                try{
                    await nftCollection.save();
                } catch(err) {
                    console.log(err.message, "updating nftCollection in scrap_etherscan");
                }
            } catch(err) {
                console.log(err.message, "creating nftCollection in scrap_etherscan");
            }
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
        // const latestBlock = await getOnchainLatestBlockNumber();
        const latestBlock = await getOpenseaLastBlockNumber();
        const nft_collections = await NFTCollection.aggregate([
            {
                "$addFields": {
                    "isNotLatest": {
                        "$lt": [
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
            console.log("No nft collections found", "getLogsByNFTCollection");
            await Timer(1000);
            continue;
        }
        console.log(nft_collections.length, "nft collections found");
        for( const nft_collection of nft_collections) {
            let params = {
                module: "logs",
                action: "getLogs",
                address: nft_collection.contractHash,
                fromBlock: 1 * nft_collection.lastCheckedBlock + 1,
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
            let firstBlock = 9999999;
            const last_log_transaction_hash = logs[logs.length - 1].transactionHash;
            if( logs.length == 1000) {
                let i = 0;
                for( i = logs.length - 2; i >= 0; i --) {
                    if( logs[i].transactionHash != last_log_transaction_hash)
                         break;
                }
                logs.splice(i + 1, 1000);
            }
            let fetch_required_transaction_hashes = [];
            let add_required_transactions = [];
            for( const log of logs) {
                const blockNumber = converter.hexToDec(log.blockNumber);
                if( lastBlock < blockNumber)
                    lastBlock = blockNumber;
                if( firstBlock > blockNumber)
                    firstBlock = blockNumber;
                log.topicsLength = log.topics.length;
                //if traded with alt token
                if( log.topicsLength == 1) { 
                    const from = "0x" + log.data.substr(2, 64);
                    const to = "0x" + log.data.substr(66, 64);
                    log.tokenID = converter.hexToDec("0x" + log.data.substr(130));
                    await Promise.all( addWalletInfoToWatchList({
                        address: from,
                        spent: 0,
                        revenue: 0,
                        nfts_bought: 0,
                        nfts_sold: 1,
                        mint: 0
                    }), addWalletInfoToWatchList({
                        address: to,
                        spent: 0,
                        revenue: 0,
                        nfts_bought: 1,
                        nfts_sold: 0,
                        mint: 1
                    }));
                    if( add_required_transactions.find( element => element.hash == log.transactionHash) === undefined)
                        add_required_transactions.push( {
                            hash: log.transactionHash,
                            timeStamp: log.timeStamp,
                            block_height: log.blockNumber,
                            gas_price: log.gasPrice,
                            gas_used: log.gasUsed,
                            fees: converter.hexToDec(log.gasPrice) * converter.hexToDec(log.gasUsed) / (10 ** 18)
                        });
                } else if( log.topics[1] == topic1_mint  //if it is a mint log
                    && log.topicsLength == 4) {
                    addWalletInfoToWatchList({
                        address: "0x" + log.topics[2].substr(26),
                        spent: 0,
                        revenue: 0,
                        nfts_bought: 0,
                        nfts_sold: 0,
                        mint: 1
                    });
                    log.tokenID = converter.hexToDec(log.topics[3]);
                    if( add_required_transactions.find( element => element.hash == log.transactionHash) === undefined)
                        add_required_transactions.push( {
                            hash: log.transactionHash,
                            timeStamp: log.timeStamp,
                            block_height: log.blockNumber,
                            gas_price: log.gasPrice,
                            gas_used: log.gasUsed,
                            fees: converter.hexToDec(log.gasPrice) * converter.hexToDec(log.gasUsed) / (10 ** 18)
                        });
                } else if( log.topics[1] != topic1_mint //if it is a trade with eth
                    && log.topics[2] != topic1_mint
                    && log.topicsLength == 4
                    && fetch_required_transaction_hashes.find( element => element.hash == log.transactionHash) === undefined) {
                        const from = "0x" + log.topics[1].substr(26);
                        const to = "0x" + log.topics[2].substr(26);
                        log.tokenID = converter.hexToDec(log.topics[3]);
                        await Promise.all(addWalletInfoToWatchList({
                            address: from,
                            spent: 0,
                            revenue: 0,
                            nfts_bought: 0,
                            nfts_sold: 1,
                            mint: 0
                        }), addWalletInfoToWatchList({
                            address: to,
                            spent: 0,
                            revenue: 0,
                            nfts_bought: 1,
                            nfts_sold: 0,
                            mint: 0
                        }));
                        fetch_required_transaction_hashes.push({
                            hash: log.transactionHash,
                            block_height: log.blockNumber,
                            // timeStamp: log.timeStamp,
                            // gas_price: log.gasPrice,
                            // gas_used: log.gasUsed,
                            // total: converter.hexToDec("0x" + log.data.substr(130)) / (10 ** 18),
                            // fees: converter.hexToDec(log.gasPrice) * converter.hexToDec(log.gasUsed) / (10 ** 18)
                        });
                }
            }
            try {
                console.log("adding logs for",logs[0].address);
                await Log.insertMany(logs, {ordered: false});
                console.log(logs.length, "logs added for",logs[0].address);
            } catch(err) {
                console.log(logs.length, "logs added for",logs[0].address);
            }
            try {
                if( add_required_transactions.length) {
                    console.log("adding 0 price transactions for", logs[0].address);
                    await TransactionHistory.insertMany(add_required_transactions, {ordered: false});
                    console.log(add_required_transactions.length, "0 price transactions for", logs[0].address);
                }
            } catch(err) {
                console.log(add_required_transactions.length, "0 price transactions for", logs[0].addres);
            }
            for(const transaction of add_required_transactions) {
                let index;
                if((index = fetch_required_transaction_hashes.find( element => element.hash == transaction.hash)) !== undefined){
                    fetch_required_transaction_hashes.splice(index, 1);
                }
            }
            const opensea_logs = await OpenSeaLog.find({"blockNumber":{"$gte": firstBlock, "$lte": lastBlock}});
            for( let i = 0; i < fetch_required_transaction_hashes.length; i ++) {
                console.log("foundddddddddd");
                let index;
                if( (index = opensea_logs.find(element=> element.hash == fetch_required_transaction_hashes[i].hash)) !== undefined) {
                    const log = opensea_logs[index];
                    const from = "0x" + log.topics[1].substr(26);
                    const to = "0x" + log.topics[2].substr(26);
                    fetch_required_transaction_hashes[i] = {
                        hash: log.transactionHash,
                        timeStamp: log.timeStamp,
                        block_height: log.blockNumber,
                        gas_price: log.gasPrice,
                        gas_used: log.gasUsed,
                        total: converter.hexToDec("0x" + log.data.substr(130)) / (10 ** 18),
                        fees: converter.hexToDec(log.gasPrice) * converter.hexToDec(log.gasUsed) / (10 ** 18)
                    };
                    await Promise.all(addWalletInfoToWatchList({
                        address: from,
                        spent: 0,
                        revenue: fetch_required_transaction_hashes[i].total,
                        nfts_bought: 0,
                        nfts_sold: 0,
                        mint: 0
                    }), addWalletInfoToWatchList({
                        address: to,
                        spent: fetch_required_transaction_hashes[i].total,
                        revenue: 0,
                        nfts_bought: 0,
                        nfts_sold: 0,
                        mint: 0
                    }));
                }
            }
            try {
                if( fetch_required_transaction_hashes.length){
                    console.log("adding fetch required transactions for ", )
                    await TransactionHistory.insertMany(fetch_required_transaction_hashes, {ordered: false});
                }
            } catch(err) {}
            try{
                await NFTCollection.updateOne({contractHash: nft_collection.contractHash}, {lastCheckedBlock: lastBlock});
                console.log("lastBlock:", lastBlock, nft_collection.contractHash);
            }catch(err) {
                console.log(err.message, "updating nftcollectionlist lastcheckedblocknumber");
            }
        }
        await Timer(1000);
        console.log("nft one round finished");
    }
}
