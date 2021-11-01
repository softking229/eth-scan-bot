import axios from 'axios'
import converter from 'hex2dec'
import util from 'util'
import NFTCollection from '../models/NFTCollection.js'
import {getTotalDevices} from "./DeviceController.js"
import {getDatabaseLatestBlockNumber, wait_api_call_limit, addLog} from "./TransactionController.js"
import TransactionHistory from '../models/TransactionHistory.js'
import { topic0_AuctionSuccessful, topic0_transfer, topic1_mint, duration_for_checking_nft_collection } from '../consts.js'
import { addWalletInfoToWatchList, getDatabaseLatestTimeStamp } from './TransactionController.js'
import OpenSeaLog from '../models/OpenSeaLog.js'
import {getOpenseaLastBlockNumber} from './OpenSeaContracts.js'
import OpenSeaContractLog from '../models/OpenSeaContractLog.js'

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
        await Timer(1000);
        console.log("nft one round finished");
    }
}
export const newWallet = () => {
    return {
        address: "",
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
    params.address = nft_collection.contractHash,
    params.fromBlock = 1 * nft_collection.lastCheckedBlock + 1
    let logs = [];
    while(true) {
        try{
            params.apikey = await wait_api_call_limit();
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
        return;
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
    let transaction_infos = {};
    let fetch_required_transaction_hashes = [];
    let add_required_transactions = [];
    for( const log of logs) {
        const blockNumber = converter.hexToDec(log.blockNumber);
        if( lastBlock < blockNumber) lastBlock = blockNumber;
        if( firstBlock > blockNumber) firstBlock = blockNumber;

        log.topicsLength = log.topics.length;
        if( !transaction_infos[log.transactionHash]) transaction_infos = [];
        transaction_infos.push(log);
    }
    try {
        console.log("adding logs for",logs[0].address);
        await Log.insertMany(logs, {ordered: false});
        console.log(logs.length, "logs added for",logs[0].address);
    } catch(err) {
        console.log(logs.length, "logs added for",logs[0].address);
    }
    const opensea_logs = await OpenSeaContractLog.find({"blockNumber":{"$gte": firstBlock, "$lte": lastBlock}});
    for( const opensea_log of opensea_logs)
        if( transaction_infos[opensea_log.transactionHash])
            transaction_infos[opensea_log.transactionHash].push(opensea_log);
    let wallet_infos = {};
    let transactions = [];
    for( let hash in transaction_infos) {
        let logs = transaction_infos[hash];
        let is_mint = false;
        let is_ownership_transfer = false;
        let isAuctionSuccessful = false;
        let price = 0;
        let is_price_set = false;
        let from;
        let to;
        for( const log of logs) {
            //ownership transfer
            if( log.topics[0] == topic0_OwnershipTransferred) {
                is_ownership_transfer = true;
                from = "0x" + log.topics[1].substr(26);
                to = "0x" + log.topics[2].substr(26);
                if( log.topics[1] != topic1_mint
                    && log.topicsLength == 3) {
                    wallet_infos[from] = wallet_infos[from]?wallet_infos[from]:newWallet();
                    wallet_infos[to] = wallet_infos[to]?wallet_infos[to]:newWallet();
                    wallet_infos[from].collections_sold ++;
                    wallet_infos[to].collections_bought ++;
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
            if( log.topicsLength == 4) {
                //if this transaction is AuctionSuccessful
                if( isAuctionSuccessful) {
                    from = "0x" + log.topics[1].substr(26);
                    to = "0x" + log.topics[2].substr(26);
                    wallet_infos[from] = wallet_infos[from]?wallet_infos[from]:newWallet();
                    wallet_infos[to] = wallet_infos[to]?wallet_infos[to]:newWallet();
                    wallet_infos[from].nfts_sold ++;
                    wallet_infos[to].nfts_bought ++;
                    continue;
                }
                //if mint
                if( log.topics[1] == topic1_mint) {
                    to = "0x" + log.topics[2].substr(26);
                    wallet_infos[to] = wallet_infos[to]?wallet_infos[to]:newWallet();
                    wallet_infos[to].mint ++;
                    is_mint = true;
                    continue;
                }
                continue;
            }
            //nft transfer
            if( log.topicsLength == 1) {
                //if this transaction is AuctionSuccessful
                from = "0x" + log.topics[1].substr(26);
                to = "0x" + log.topics[1].substr(90);
                wallet_infos[from] = wallet_infos[from]?wallet_infos[from]:newWallet();
                wallet_infos[to] = wallet_infos[to]?wallet_infos[to]:newWallet();
                wallet_infos[from].nfts_sold ++;
                wallet_infos[to].nfts_bought ++;
            }
            if( !is_mint) {
                wallet_infos[from].revenue += price;
                wallet_infos[to].spent += price;
            }
        }
        transactions.push({
            hash: logs[0].transactionHash,
            timeStamp: log[0].timeStamp,
            block_height: log[0].blockNumber,
            gas_price: log[0].gasPrice,
            gas_used: log[0].gasUsed,
            total: price,
            fees: converter.hexToDec(log[0].gasPrice)
                * converter.hexToDec(log[0].gasUsed) / (10 ** 18)
        });
    }
    for( const wallet_info of wallet_infos) {
        await addWalletInfoToWatchList( wallet_info);
    }
    try{
        await NFTCollection.updateOne({contractHash: nft_collection.contractHash}, {lastCheckedBlock: lastBlock});
        console.log("lastBlock:", lastBlock, nft_collection.contractHash);
    }catch(err) {
        console.log(err.message, "updating nftcollectionlist lastcheckedblocknumber");
    }
}