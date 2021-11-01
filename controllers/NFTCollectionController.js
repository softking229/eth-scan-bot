import axios from 'axios'
import converter from 'hex2dec'
import util from 'util'
import NFTCollection from '../models/NFTCollection.js'
import {getTotalDevices} from "./DeviceController.js"
import {getDatabaseLatestBlockNumber, wait_api_call_limit, addLog} from "./TransactionController.js"
import TransactionHistory from '../models/TransactionHistory.js'
import { topic1_mint } from '../consts.js'
import { addWalletInfoToWatchList, getDatabaseLatestTimeStamp } from './TransactionController.js'
import OpenSeaLog from '../models/OpenSeaLog.js'
import {getOpenseaLastBlockNumber} from './OpenSeaContracts.js'

const Timer = util.promisify(setTimeout);

async function scrap_etherscan(page) {
    console.log("begin scrapping nft_collection page:", page);
    let latestTimeStamp = await getDatabaseLatestTimeStamp();
    let html;
    while(true) {
        try {
            console.log("scrapping page");
            html = await axios.get("https://etherscan.io/tokens-nft", {
                params: {
                    p: page,
                    ps:100
                }
            }).catch(error => {
                throw error
            })
            break;
        } catch (error) {
            console.log(error.message, "in scrapping token-nft page", page);
            await Timer(5000);
            continue;
        }
    }
    const tr_list = html.data.match(/<tr[\s\S]*?<\/tr>/g);
    if( !tr_list
    || tr_list.length <= 1) {
        global.nft_collection_stop_sign = true;
        console.log("stopped scrapping nft_collection at page:", page);
        return 0;
    }
    tr_list.shift();
    let nft_infos = [];
    for( const tr of tr_list) {
        const td_list = tr.match(/<td[\s\S]*?<\/td>/g);
        if( !td_list
            || td_list.length != 4) {
            continue;
        }
        const url_list = td_list[1].match(/(?<=token\/)0x[a-zA-Z0-9]+/g);
        if( !url_list
            || !url_list.length)
            continue;
        const url = url_list[0];
        const transfer_3day = parseInt(td_list[3].substr(4, td_list[3].length - 9));
        nft_infos.push({
            url: url,
            latestTimeStamp: latestTimeStamp,
            page: page,
            transfer_3day: transfer_3day
        });
        console.log(td_list[0], td_list[3], transfer_3day);
    }
    if( !nft_infos.length) {
        global.nft_collection_stop_sign = true;
        console.log("stopped scrapping nft_collection at page:", page);
        return 0;
    }
    const unit = 3;
    for( let index = 0; index < nft_infos.length; index += unit) {
        let sub_nft_infos = nft_infos.slice( index, index + unit);
        let promise_array = [];
        for( let i = 0; i < sub_nft_infos.length; i ++) {
            if( !sub_nft_infos[i].transfer_3day) {
                global.nft_collection_stop_sign = true;
                break;
            } else
                promise_array.push(check_nft_collection_data(sub_nft_infos[i], page));
        }
        if( promise_array.length)
            await Promise.all(promise_array);
        if( global.nft_collection_stop_sign) {
            console.log("stopped scrapping nft_collection at page:", page);
            return 0;
        }
    }
    console.log("end scrapping nft_collection page:", page);
}

export const check_nft_collection_data = async(nft_info) => {
    const url = nft_info.url;
    const page = nft_info.page;
    const latestTimeStamp = nft_info.latestTimeStamp;
    const API_URL = process.env.API_URL;
    let nftCollection;
    nftCollection = await NFTCollection.findOne({contractHash: url});
    if( !nftCollection) {
        nftCollection = new NFTCollection({contractHash: url,
        lastCheckedBlock: -1, 
        firstBlock: 0, 
        latestTimeStamp: latestTimeStamp});

        let logs;
        let params = {
            module: "logs",
            action: "getLogs",
            address: nftCollection.contractHash,
            fromBlock: 0,
            toBlock: "latest"
        };
        while(true) {
            try{
                console.log("getting first log of nft collection", params.address);
                params.apikey = await wait_api_call_limit();
                let result = await axios.get(API_URL, {params}).catch(err => {
                    throw err;
                });
                logs = result.data.result;
                if( result.data.status != "1"
                && result.data.message != "No records found"){
                    console.log( result.data, page, nftCollection.contractHash, "calling api in scrap_etherscan");
                    continue;
                }
                break;
            } catch(err) {
                console.log(err.message, "calling api in scrap_etherscan");
            }
        }
        if( !logs.length) {
            nftCollection.firstBlock = await getDatabaseLatestBlockNumber();
        }
        else
            nftCollection.firstBlock = converter.hexToDec(logs[0].blockNumber);
        nftCollection.latestTimeStamp = latestTimeStamp;
        try{
            console.log("saving nft collection", params.address);
            await nftCollection.save();
            return;
        } catch(err) {
            console.log("nft collection already exist", params.address);
            nftCollection = await NFTCollection.findOne({contractHash: url});
        }
    }
    nftCollection.latestTimeStamp = latestTimeStamp;
    try{
        console.log("updating nft collection", nftCollection.contractHash);
        await nftCollection.save();
    } catch(err) {
        console.log(err.message, "updating nftCollection in scrap_etherscan");
    }
}

export const main = async() => {
    console.log("waiting for starting checking nft collection for", 5 * global.deviceNumber);
    await Timer(5000 * global.deviceNumber);
    while(true) {
        global.nft_collection_stop_sign = false;
        const total_device_count = await getTotalDevices();
        let page = global.deviceNumber;
        const mod = page % total_device_count;
        while(true){
            let token_count = await scrap_etherscan(page);
            if( global.nft_collection_stop_sign)
                break;
            page += total_device_count;
            if(token_count == 0) break;
            await Timer(30000);
        }
        await Timer(30000);
    }
}

export const getLogsByNFTCollection = async() => {
    const API_URL = process.env.API_URL;
    while(true) {
        const total_device_count = await getTotalDevices();
        const mod = global.deviceNumber % total_device_count;
        // const latestBlock = await getDatabaseLatestBlockNumber();
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
