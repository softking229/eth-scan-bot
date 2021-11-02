import axios from 'axios'
import converter from 'hex2dec'
import abiDecoder from '../utils/abi-decoder.js'
import util from 'util'
import { etherscan_apikeys_store, etherscan_apikeys_device_cnt, opensea_api, blockcypher_transaction_api, opensea_address, topic0_transfer, topic1_mint } from '../consts.js'
import TransactionHistory from '../models/TransactionHistory.js'
import WatchList from '../models/WatchList.js'
import { JSDOM } from "jsdom"
import OnChainInfo from '../models/OnChainInfo.js'
import Log from '../models/Log.js'
import {Mutex, Semaphore, withTimeout} from 'async-mutex';
const { window } = new JSDOM()

const Timer = util.promisify(setTimeout);
const mutex = new Mutex();
const max_api_calls = 1;
let etherscan_apikeys = [];

export const set_api_keys = () => {
    for( let i = global.deviceNumber % etherscan_apikeys_device_cnt; i < etherscan_apikeys_store.length; i += etherscan_apikeys_device_cnt) {
        etherscan_apikeys.push(etherscan_apikeys_store[i]);
    }
    global.current_api_calls = (new Array(etherscan_apikeys.length)).fill(0);
}

var get_token_info = async (input) => {
    try{
        const params = abiDecoder.decodeMethod(input).params;
        const buyCallData = params[3]['value'];
        const id = converter.hexToDec(buyCallData.substr(buyCallData.length - 64));
        const address = params[0]['value'][4];
        const {data: {assets: [info]}} = await axios.get(opensea_api + '/v1/assets', { 
            params: {
                asset_contract_address: address,
                token_ids: id,
                offset: 0,
                limit: 1
        }})
        return {
            address, 
            id, 
            name: info.name, 
            link: `https://etherscan.io/token/${address}?a=${id}`
        };
    } catch(err) {
        return 0;
    }
}

export const wait_api_call_limit = async() => {
    let key;
    const release = await mutex.acquire();
    try {
        while(true){
            let min_id = 0;
            for(let i = 0; i < current_api_calls.length; i ++) {
                if(current_api_calls[i] < current_api_calls[min_id]){
                    min_id = i;
                }
            }
            // console.log("min_id:", min_id, current_api_calls[min_id]);
            if(current_api_calls[min_id] < max_api_calls){
                current_api_calls[min_id] ++;
                setTimeout(() => current_api_calls[min_id] --, 1100);
                key = etherscan_apikeys[min_id];
                break;
            }
            await Timer(10);
        }
    } catch(err){}
    while(true) {
        try {
            await release();
            break;
        } catch(err) {
            console.log(err.message, "in mutex release of wait_api")
        }
    }
    return key;
}

axios.interceptors.request.use( request => {
    if(request.url == process.env.API_URL ){
        //console.log(current_api_calls);
    }
    return request;
})

export const fetch_wallet_transactions = async(params, wallet) => {
    const API_URL = process.env.API_URL;
    
    const API_KEY1 = await wait_api_call_limit();
    Object.assign(params, {apikey: API_KEY1});    

    
    const API_KEY2 = await wait_api_call_limit();

    const params_all = {
        module: "account",
        action: "tokennfttx",
        address: wallet,
        startblock: 0,
        endblock: 999999999,
        sort: "desc",
        apikey: API_KEY2
    }

    let wallet_address = `0x${"0".repeat(24)}${wallet.substr(2)}`;

    const [
        { data: {result: opensea_nft_tx_list1, status }},
        { data: {result: opensea_nft_tx_list2 }},
        { data: {result: all_nft_tx_list }}
     ] = await Promise.all([
         axios.get(API_URL, {params: {...params, topic1: wallet_address}}),
         axios.get(API_URL, {params: {...params, topic2: wallet_address}}),
         axios.get(API_URL, {params: params_all})
     ]);
    
    const opensea_nft_tx_list = opensea_nft_tx_list1.concat(opensea_nft_tx_list2);

    if( status != "1")
        return [];

    console.log("total nft tx count", all_nft_tx_list.length, opensea_nft_tx_list.length);
        
    var tx_results = [];
    await Promise.all(
        all_nft_tx_list.map( async (nft_tx, idx) => {
            
            let nft_tx_detail = opensea_nft_tx_list.find(each => nft_tx.hash == each.transactionHash);

            if(nft_tx.from == "0x0000000000000000000000000000000000000000") nft_tx_detail = 0;
            else if(!nft_tx_detail) return;
    
            const tx_result = {
                blockNumber: nft_tx.blockNumber,
                transactionHash: nft_tx.hash,
                from: nft_tx.from,
                to: nft_tx.to,
                token: {id: nft_tx.tokenID, name: nft_tx.tokenName, },
                value: nft_tx_detail.data ? converter.hexToDec(nft_tx_detail.data.substr(130)) / (10 ** 18) : "",
                timestamp: converter.hexToDec(nft_tx.timeStamp) * 1000
            }
            tx_result.type = !nft_tx_detail ? 'mint' : (wallet == tx_result.from ? 'sell' : 'buy'),
            tx_results.push(tx_result);
    
            console.log(tx_result.transactionHash, tx_result.value);
        })        
    )
    return tx_results;
};

export const addLog = async(log) => {
    while( true) {
        try {
            await Log.create(log);
            let transaction = {
                from_opensea: true,
                block_height: log.blockNumber,
                hash: log.transactionHash,
                fees: converter.hexToDec(log.gasPrice) / (10 ** 18) * converter.hexToDec(log.gasUsed),
                gas_used: log.gasUsed,
                gas_price: log.gasPrice,
                timeStamp: log.timeStamp * 1000
            };
            if( log.topics[0] == topic0_mint
                && log.topics[1] == topic1_mint){
                addTransaction( transaction);
                addWalletInfoToWatchList({
                    address: "0x" + log.topics[2].substr(26),
                    spent: 0,
                    revenue: 0,
                    nfts_bought: 0,
                    nfts_sold: 0,
                    mint: 1
                });
                return;
            }
            if( log.topics[0] != topic_orders_matched
                || log.address != opensea_address)
                return;
            let nft_from = "0x" + log.topics[1].substr(26);
            let nft_to = "0x" + log.topics[2].substr(26);
            let total = hexToDec(log.data.substr(130)) * 1.0 / (10 ** 18);
            let transaction_history = await TransactionHistory.findOne({hash: log.transactionHash});
            if( transaction_history) {
                if( log.address != opensea_address && transaction_history.from_opensea)
                    await fetch_transaction_by_hash(log.transactionHash, transaction_history, log);
            } else {
                if( log.address != opensea_address) {
                    await fetch_transaction_by_hash(log.transactionHash, transaction_history, log);
                }
                else {
                    let transaction = {
                        from_opensea: true,
                        block_height: log.blockNumber,
                        hash: log.transactionHash,
                        addresses: ["0x" + log.topics[1].substr(26),
                                    "0x" + log.topics[2].substr(26)],
                        total: converter.hexToDec(log.data.substr(130)) * 1.0 / (10 ** 18),
                        fees: converter.hexToDec(log.gasPrice) / (10 ** 18) * converter.hexToDec(log.gasUsed),
                        gas_used: log.gasUsed,
                        gas_price: log.gasPrice,
                        timeStamp: log.timeStamp * 1000
                    };
                    let eth_trans_limit = 10;
                    let eth_trans_limit_completely = 400;
                    if( transaction.total > eth_trans_limit 
                        && transaction.total < eth_trans_limit_completely) {
                        console.log("total is higher than ", eth_trans_limit);
                        await fetch_transaction_by_hash(log.transactionHash, transaction_history, log, transaction.total);
                    }
                    else {
                        if( transaction.total >= eth_trans_limit_completely) {
                            console.log("total is higher than ", eth_trans_limit_completely);
                            transaction.alt_total = transaction.total;
                            transaction.total = 0;
                        } else console.log("total is less than ", eth_trans_limit);
                        await addTransaction(transaction, true);
                    }
                }
            }
            break;
        } catch (error) { break; }
    }
}

export const fetch_transaction_by_hash = async(hash, oldTransaction, log, alt_total = 0) => {
    if(global.fetch_transaction_pending.findIndex(element => element == hash) >= 0) {
        return;
    }
    global.fetch_transaction_pending.push(hash);
    while(true) {
        try{
            const API_KEY = await wait_api_call_limit();
            const API_URL = process.env.API_URL;
            let params = {
                module: "account",
                action: "txlist",
                address: "0x" + log.topics[2].substr(26),
                startblock: converter.hexToDec(log.blockNumber),
                endblock: converter.hexToDec(log.blockNumber),
                apikey: API_KEY
            };
            let response = await axios( API_URL, {params}).catch(err => {
                throw err;
            });
            if( response.data === undefined 
                || response.data.result === undefined 
                || response.data.result == "Max rate limit reached"){
                await Timer(1000);
                continue;
            }
            let transaction = response.data.result.find(element => element.hash == log.transactionHash);
            if( transaction === undefined)
                break;
            let result = {
                from_opensea: false,
                block_height: transaction.blockNumber,
                hash: transaction.hash,
                addresses: [transaction.from, transaction.to],
                total: 1.0 * transaction.value / (10 ** 18),
                fees: 1.0 * transaction.gasPrice / (10 ** 18) * transaction.gasUsed,
                gas_used: transaction.gasUsed,
                gas_price: 1.0 * transaction.gasPrice / (10 ** 18),
                timeStamp: transaction.timeStamp * 1000,
                confirmations: transaction.confirmations,
                gas_tip_cap: 0,
                gas_fee_cap: 0
            }
            if( log.address == opensea_address) {
                if( 1.0 * result.total == 0){
                    result.alt_total = alt_total;
                    result.total = 0;
                }
            }

            let isTrade = true;
            if( log.topics.length >=1 && log.topics[1] == "0x0000000000000000000000000000000000000000000000000000000000000000")
                isTrade = false;
            await addTransaction( result, isTrade);
            const index = global.fetch_transaction_pending.findIndex(element => element == hash);
            global.fetch_transaction_pending.splice(index, 1);
            break;
        } catch(err) {
            console.log(err.message, "fetch_transaction_by_hash");
            await Timer(500);
        }
    }
}

export const addTransaction = async(transaction, isTrade) => {
    try {
        let transaction_row = await TransactionHistory.findOne({hash: transaction.hash});
        if( transaction_row) {
            if( !isTrade) {
                await addWalletInfoToWatchList({
                    address: transaction.addresses[1],
                    spent: 0,
                    revenue: 0,
                    nfts_bought: 0,
                    nfts_sold: 0,
                    mint: 1
                });
            }
            if( transaction_row.from_opensea == true
                && transaction.from_opensea == false) {
                await TransactionHistory.updateOne({hash: transaction.hash}, transaction);
            }
            return;
        }
        await TransactionHistory.create(transaction);
        let promise_array = [];
        // if( transaction.from_opensea == true
        //     ||(transaction.internal_txids != undefined 
        //         && !transaction.internal_txids.length)) {
        if( transaction.addresses[0] == "" || transaction.addresses[1] == "")
            return;
        if( isTrade) {
            promise_array.push(addWalletInfoToWatchList({
                address: transaction.addresses[0],
                spent: 0,
                revenue: transaction.total,
                nfts_bought: 0,
                nfts_sold: 1,
                mint: 0
            }))
            promise_array.push(addWalletInfoToWatchList({
                address: transaction.addresses[1],
                spent: transaction.total,
                revenue: 0,
                nfts_bought: 1,
                nfts_sold: 0,
                mint: 0
            }))
        } else {
            promise_array.push(addWalletInfoToWatchList({
                address: transaction.addresses[1],
                spent: 0,
                revenue: 0,
                nfts_bought: 0,
                nfts_sold: 0,
                mint: 1
            }))
        }
        await Promise.all(promise_array);
    } catch (error) {console.log(error.message, "addTransaction")};
}

export const addWalletInfoToWatchList = async(params) => {
    try {
        await WatchList.create(params);
    } catch (error) {
        const wallet = await WatchList.findOne({address: params.address});
        wallet.spent += params.spent;
        wallet.revenue += params.revenue;
        wallet.nfts_bought += params.nfts_bought;
        wallet.nfts_sold += params.nfts_sold;
        wallet.mint += params.mint;
        wallet.collections_bought += params.collections_bought;
        wallet.collections_sold += params.collections_sold;
        wallet.save();
    }
}

export const getOnchainLatestBlocknumber = async() => {
    while(true) {
        console.log("latest BlockNumber:", converter.hexToDec(await fetch_latest_blocknumber()));
        await Timer(5000);
    }
}

export const fetch_latest_blocknumber = async() => {
    console.log("begin fetching last block info");
    const API_URL = process.env.API_URL;
    const params = {
        module: "proxy",
        action: "eth_blockNumber",
        apikey: "DSCNI3CR3TAY18RX53M95GEBRECU8TS273"
    }
    let latest_onchain_blocknumber;
    while(true) {
        try{
            let result = await axios( API_URL, {params}).catch(err => {
                throw err;
            });
            if( result.data === undefined || result.data.result === undefined || result.data.result == "Max rate limit reached"){
                await Timer(1000);
                continue;
            }
            latest_onchain_blocknumber = result.data.result;
            break;
        } catch(err) {
            console.log(err.message, "fetch_latest_blocknumber");
            await Timer(1000);
        }
    }
    let latest_onchain_timestamp;
    params.module = "block";
    params.action = "getblockreward";
    params.blockno = converter.hexToDec(latest_onchain_blocknumber);
    while(true) {
        try{
            let result = await axios( API_URL, {params}).catch(err => {
                throw err;
            });
            if( result.data === undefined || result.data.result === undefined || result.data.result == "Max rate limit reached"){
                await Timer(1000);
                continue;
            }
            latest_onchain_timestamp = result.data.result.timeStamp;
            break;
        } catch(err) {
            console.log(err.message, "fetch_latest_timestamp");
            await Timer(1000);
        }
    }
    let result = await OnChainInfo.findOne({});
    if( result == null) {
        result = new OnChainInfo({lastBlock: latest_onchain_blocknumber, timeStamp:latest_onchain_timestamp});
    }
    else {
        result.lastBlock = latest_onchain_blocknumber;
        result.timeStamp = latest_onchain_timestamp;
    }
    await result.save();
    console.log("end fetching last block info");
    return latest_onchain_blocknumber;
}
export const getDatabaseLatestBlockNumber = async() => {
    const {lastBlock:latestBlock} = await OnChainInfo.findOne();
    return latestBlock;
}
export const getDatabaseLatestTimeStamp = async() => {
    while( true) {
        const {timeStamp:timeStamp} = await OnChainInfo.findOne();
        if( timeStamp == null) {
            await Timer(500);
            continue;
        }
        return timeStamp;
    }
}

export const fetch_transaction_value = async(hash, blockNumber, accounts) => {
    const API_URL = process.env.API_URL;
    let params = {
        module: 'account',
        action: 'txlist',
        startblock: blockNumber,
        endblock: blockNumber,
    }
    let tx_list;
    let index = 0;
    while( index < accounts.length) {
        let is_found = false;
        let account = accounts[index];
        params.address = account;
        while(true) {
            try{
                console.log("fetching transaction of ", hash, blockNumber, account);
                params.apikey = await wait_api_call_limit();
                let result = await axios.get(API_URL, {params}).catch(err => {
                    throw err;
                });
                if( result.data.status != "1"
                && result.data.message != "No records found"){
                    console.log( result.data, hash, blockNumber, account, "calling api in fetch_transaction_value");
                    break;
                }
                tx_list = result.data.result;
                is_found = true;
                break;
            } catch(err) {
                console.log(err.message, "fetching_transaction_value");
            }
        }
        if( is_found)
            break;
        index ++;
    }
    if( index == accounts.length) {
        console.log("no transaction found for ", hash, accounts);
        return 0;
    }
    const transaction = tx_list.find(element => element.hash == hash);
    let value;
    if( !transaction) value = 0;
    else value =  1 * transaction.value / (10 ** 18);
    console.log("value is ", value);
    return value;
}