import axios from 'axios'
import converter from 'hex2dec'
import util from 'util'
import NFTCollection from '../models/NFTCollection.js'
import {getTotalDevices} from "./DeviceController.js"
import {getDatabaseLatestBlockNumber, wait_api_call_limit, addLog} from "./TransactionController.js"
import TransactionHistory from '../models/TransactionHistory.js'
import { topic0_AuctionSuccessful, topic0_transfer, topic1_mint, duration_for_checking_nft_collection,
    topic0_OwnershipTransferred, topic_orders_matched } from '../consts.js'
import { addWalletInfoToWatchList, getDatabaseLatestTimeStamp, fetch_transaction_value } from './TransactionController.js'
import {getOpenseaLastBlockNumber} from './OpenSeaContracts.js'
import OpenSeaContractLog from '../models/OpenSeaContractLog.js'
import Log from '../models/Log.js'

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
        const name_list = td_list[1].match(/data-toggle='tooltip' title=[\s\S]*?<\/a>/g);
        let name = "";
        if( name_list && name_list.length) {
            name = name_list[0].substr(71, name_list[0].length - 75);
        }
        const transfer_3day = parseInt(td_list[3].substr(4, td_list[3].length - 9));
        nft_infos.push({
            url: url,
            latestTimeStamp: latestTimeStamp,
            page: page,
            transfer_3day: transfer_3day,
            name: name
        });
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
    const name = nft_info.name;
    const API_URL = process.env.API_URL;
    let nftCollection;
    nftCollection = await NFTCollection.findOne({contractHash: url});
    if( !nftCollection) {
        nftCollection = new NFTCollection({contractHash: url,
        lastCheckedBlock: -1, 
        firstBlock: 0,
        name: name,
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
                console.log("getting first log of nft collection", params.address, "at page", page);
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
            console.log("saving nft collection", params.address, "at page", page);
            await nftCollection.save();
            return;
        } catch(err) {
            console.log("nft collection already exist", params.address, "at page", page);
            nftCollection = await NFTCollection.findOne({contractHash: url});
        }
    }
    nftCollection.latestTimeStamp = latestTimeStamp;
    try{
        console.log("updating nft collection", nftCollection.contractHash, "at page", page);
        await nftCollection.save();
    } catch(err) {
        console.log(err.message, "updating nftCollection in scrap_etherscan", "at page", page);
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

export const getLogsByCheckableNFTCollections = async() => {
    const API_URL = process.env.API_URL;
    while(true) {
        const total_device_count = await getTotalDevices();
        const mod = global.deviceNumber % total_device_count;
        const latestBlock = await getOpenseaLastBlockNumber();
        const latestOnChainTimeStamp = await getDatabaseLatestTimeStamp();
        const possibleTimeStamp = latestOnChainTimeStamp - duration_for_checking_nft_collection * 60;
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
                    },
                    "isLastChecked": {
                        "$gt": [
                            "$latestTimeStamp", possibleTimeStamp
                        ]
                    }
                }
            },
            {
                "$match": { 
                    "$and": [
                        {"mod": mod},
                        {"isNotLatest": true},
                        {"isLastChecked": true}
                    ]
                }
            }
        ]).exec();
        if( !nft_collections.length) {
            console.log("No nft collections found to check", "getLogsByNFTCollection");
            await Timer(1000);
            continue;
        }
        console.log(nft_collections.length, "nft collections found to check");
        let params = {
            module: "logs",
            action: "getLogs",
            toBlock: latestBlock,
        }
        for( const nft_collection of nft_collections) {
            await getLogsByNFTCollection(nft_collection, params);
        }
        // await Timer(1000);
        console.log("----------------nft one round finished----------------");
    }
}
export const newWallet = (address) => {
    return {
        address: address,
        spent: 0,
        revenue: 0,
        nfts_bought: 0,
        nfts_sold: 0,
        mint: 0,
        collections_bought: 0,
        collections_sold: 0
    };
}
export const getLogsByNFTCollection = async(nft_collection, params) => {
    console.log("checking nft_collection", nft_collection.contractHash);
    const API_URL = process.env.API_URL;
    params.address = nft_collection.contractHash,
    params.fromBlock = 1 * nft_collection.lastCheckedBlock + 1
    let logs = [];
    while(true) {
        try{
            console.log("fetching logs for nft_collection", nft_collection.contractHash);
            params.apikey = await wait_api_call_limit();
            let result = await axios.get(API_URL, {params}).catch(err => {
                throw err;
            });
            if(result.data.status != "1" && result.data.message != "No records found")
                continue;
            logs = result.data.result; 
            break;
        } catch(err) {
            console.log(err.message, "getLogsByNFTCollection");
            await Timer(1000);
        }
    }
    if( !logs.length) {
        return;
    }
    console.log(logs.length, "logs fetched for nft_collection", nft_collection.contractHash);
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
    let transaction_infos = {};
    let findQuery = [];
    for( const log of logs) {
        const blockNumber = converter.hexToDec(log.blockNumber);
        if( lastBlock < blockNumber) lastBlock = blockNumber;
        if( firstBlock > blockNumber) firstBlock = blockNumber;

        log.topicsLength = log.topics.length;
        if( !transaction_infos[log.transactionHash]) transaction_infos[log.transactionHash] = []
        transaction_infos[log.transactionHash].push(log);
        if( log.topics[0] != topic0_transfer) continue;
        if( log.topicsLength == 4) {
            log.tokenID = converter.hexToDec(log.topics[3]);
        } else if( log.topicsLength == 1) {
            log.tokenID = converter.hexToDec("0x" + log.data.substr(130));
        }
    }
    try {
        console.log("adding logs for",logs[0].address);
        await Log.insertMany(logs, {ordered: false});
        console.log(logs.length, "logs totally added for",logs[0].address);
    } catch(err) {
        console.log(logs.length, "logs added for",logs[0].address);
    }
    // let wallet_infos = {};
    // let transactions = [];
    global.wallet_infos = [];
    global.transactions = [];
    const unit = 3;
    let promise = [];
    for( let hash in transaction_infos) {
        if( promise.length >= unit) {
            try{
                await Promise.all(promise);
            } catch(err) {
                console.log(err.message);
            }
            promise = [];
        }
        promise.push(analyze_transaction_logs(transaction_infos[hash]));
    }
    if( promise.length) {
        try{
            await Promise.all(promise);
        } catch(err) {
            console.log(err.message);
        }
    }
    for( let address in global.wallet_infos) {
        await addWalletInfoToWatchList( global.wallet_infos[address]);
    }
    try{
        TransactionHistory.insertMany(global.transactions, {ordered: false});
    } catch(err) {}
    try{
        await NFTCollection.updateOne({contractHash: nft_collection.contractHash}, {lastCheckedBlock: lastBlock});
        console.log("lastBlock:", lastBlock, nft_collection.contractHash);
    }catch(err) {
        console.log(err.message, "updating nftcollectionlist lastcheckedblocknumber");
    }
}

export const analyze_transaction_logs = async(transaction_info) => {
    let logs = transaction_info;
    let is_mint = false;
    let is_ownership_transfer = false;
    let isAuctionSuccessful = false;
    let price = 0;
    let is_price_set = false;
    let from;
    let to;
    let has_transfer = false;
    const hash = logs[0].transactionHash;
    for( const log of logs) {
        //ownership transfer
        if( log.topics[0] == topic0_OwnershipTransferred) {
            is_ownership_transfer = true;
            from = "0x" + log.topics[1].substr(26);
            to = "0x" + log.topics[2].substr(26);
            if( log.topics[1] != topic1_mint
                && log.topicsLength == 3) {
                global.wallet_infos[from] = global.wallet_infos[from]?global.wallet_infos[from]:newWallet(from);
                global.wallet_infos[to] = global.wallet_infos[to]?global.wallet_infos[to]:newWallet(to);
                global.wallet_infos[from].collections_sold ++;
                global.wallet_infos[to].collections_bought ++;
                break;
            }
        }
        //AuctionSuccessful
        if( log.topics[0] == topic0_AuctionSuccessful) {
            isAuctionSuccessful = true;
            is_price_set = true;
            price = converter.hexToDec(log.data.substr(66, 64)) / (10 ** 18);
            continue;
        }
        //opensea ordersmatch
        if( log.topics[0] == topic_orders_matched
        && log.address == opensea_address) {
            if( !is_price_set) {
                price = converter.hexToDec(log.data.substr(130)) / (10 ** 18);
                is_price_set = true;
            }
        }
        //else
        if( log.topics[0] != topic0_transfer) continue;
        //nft transfer
        has_transfer = true;
        if( log.topicsLength == 4) {
            //if mint
            if( log.topics[1] == topic1_mint) {
                to = "0x" + log.topics[2].substr(26);
                global.wallet_infos[to] = global.wallet_infos[to]?global.wallet_infos[to]:newWallet(to);
                global.wallet_infos[to].mint ++;
                is_mint = true;
                continue;
            }
            //if this transaction is AuctionSuccessful
            if( is_mint)
                continue;
            from = "0x" + log.topics[1].substr(26);
            to = "0x" + log.topics[2].substr(26);
            global.wallet_infos[from] = global.wallet_infos[from]?global.wallet_infos[from]:newWallet(from);
            global.wallet_infos[to] = global.wallet_infos[to]?global.wallet_infos[to]:newWallet(to);
            global.wallet_infos[from].nfts_sold ++;
            global.wallet_infos[to].nfts_bought ++;
            continue;
        }
        //nft transfer
        if( log.topicsLength == 1) {
            // is_price_set = true;
            from = "0x" + log.data.substr(26, 40);
            to = "0x" + log.data.substr(90, 40);
            if( from != "0x0000000000000000000000000000000000000000") {
                global.wallet_infos[from] = global.wallet_infos[from]?global.wallet_infos[from]:newWallet(from);
                global.wallet_infos[to] = global.wallet_infos[to]?global.wallet_infos[to]:newWallet(to);
                global.wallet_infos[from].nfts_sold ++;
                global.wallet_infos[to].nfts_bought ++;
            } else {
                is_mint = true;
                global.wallet_infos[to] = global.wallet_infos[to]?global.wallet_infos[to]:newWallet(to);
                global.wallet_infos[to].mint ++;
            }
        }
        if( log.topicsLenth == 3) {
            is_price_set = true;
        }
        if( !is_mint) {
            global.wallet_infos[from].revenue += price;
            global.wallet_infos[to].spent += price;
        }
    }
    if( !is_mint 
        && !is_ownership_transfer
        && !is_price_set
        && !isAuctionSuccessful
        && has_transfer) {
        // console.log("finding opensea_log", hash);
        // let opensea_log;
        // try {
        //     opensea_log = await OpenSeaContractLog.findOne({transactionHash: hash, logIndex: 1 * converter.hexToDec(logs[logs.length - 1].logIndex) + 1});
        // } catch(err) {
        //     console.log(err.message);
        // }
        // if(opensea_log) {
        //     console.log("found opensea_log", hash);
        //     price = converter.hexToDec(opensea_log.data.substr(130)) / (10 ** 18);
        // } else console.log("not found opensea_log", hash, 1 * converter.hexToDec(logs[logs.length - 1].logIndex) + 1);
        let accounts = [];
        if( from) accounts.push(from);
        if( to) accounts.push(to);
        if( accounts.length)
            price = await fetch_transaction_value(hash, converter.hexToDec(logs[0].blockNumber), accounts);
        try {
            global.wallet_infos[from].revenue += price;
            global.wallet_infos[to].spent += price;
        } catch(err) {}
    }
    global.transactions.push({
        hash: logs[0].transactionHash,
        timeStamp: logs[0].timeStamp,
        block_height: logs[0].blockNumber,
        gas_price: logs[0].gasPrice,
        gas_used: logs[0].gasUsed,
        total: price,
        fees: converter.hexToDec(logs[0].gasPrice)
            * converter.hexToDec(logs[0].gasUsed) / (10 ** 18)
    });
}