import axios from 'axios'
import converter from 'hex2dec'
import abiDecoder from '../utils/abi-decoder.js'
import util from 'util'
import { etherscan_apikeys, opensea_api, blockcypher_transaction_api } from '../consts.js'
import TransactionHistory from '../models/TransactionHistory.js'
import WatchList from '../models/WatchList.js'
import { JSDOM } from "jsdom"
import OnChainInfo from '../models/OnChainInfo.js'
import Log from '../models/Log.js'
import { opensea_address } from '../consts.js'
const { window } = new JSDOM()

const Timer = util.promisify(setTimeout);

const max_api_calls = 5;
global.current_api_calls = (new Array(etherscan_apikeys.length)).fill(0);
console.log("Current API calls", global.current_api_calls);

var get_token_info = async (input) => {
    try{
        const params = abiDecoder.decodeMethod(input).params;
        const buyCallData = params[3]['value'];
        const id = converter.hexToDec(buyCallData.substr(buyCallData.length - 64));
        const address = params[0]['value'][4];
        const {data: {assets: [info]}} = await axios.get(opensea_api + '/v1/assets', { 
            // headers: {
            //     'X-API-KEY': process.env.OPENSEA_API_KEY
            // },
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
    while(true){
        let min_id = 0;
        for(let i = 1; i < current_api_calls.length; i++) {
            if(current_api_calls[i] < current_api_calls[min_id]){
                min_id = i;
            }
        }
        if(current_api_calls[min_id] < max_api_calls){
            current_api_calls[min_id] ++;
            setTimeout(() => current_api_calls[min_id] --, 1100);
            return etherscan_apikeys[min_id];
        }
        await Timer(10);
    }
}

axios.interceptors.request.use( request => {
    if(request.url == process.env.API_URL ){
        console.log(current_api_calls);
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

export const addWalletInfoToWatchList = async(params) => {
    try {
        await WatchList.create(params);
    } catch (error) {
        const wallet = await WatchList.findOne({address: params.address});
        wallet.spent += params.spent;
        wallet.revenue += params.revenue;
        wallet.nfts_bought += params.nfts_bought;
        wallet.nfts_sold += params.nfts_sold;
        wallet.save();
    }
}

export const fetch_transaction_by_hash = async(hash, oldTransaction) => {
    if(global.fetch_transaction_pending.findIndex(element => element == hash) >= 0) {
        return;
    }
    global.fetch_transaction_pending.push(hash);
    while(true) {
        try{
            let response = await axios.get(blockcypher_transaction_api + hash).catch(err => {
                throw err;
            });
            const index = global.fetch_transaction_pending.findIndex(element => element == hash);
            let result = response.data;
            result.total = 1.0 * result.total / (10 ** 18);
            result.fees = 1.0 * result.fees / (10 ** 18);
            result.gas_price = 1.0 * result.gas_price / (10 ** 18);
            result.gas_tip_cap = 1.0 * result.gas_tip_cap / (10 ** 18);
            result.gas_fee_cap = 1.0 * result.gas_fee_cap / (10 ** 18);
            result.from_opensea = false;
            if( 1.0 * result.total >= 10000){
                result.alt_total = result.total;
                result.total = 0;
            }

            if( oldTransaction) {
                await oldTransaction.updateOne(result);
            }
            else {
                await addTransaction( result);
            }
            global.fetch_transaction_pending.splice(index, 1);
            //console.log("****************removed", hash);
            break;
        } catch(err) {
            //console.log("Please check your network");
            console.log(err.message);
            await Timer(500);
        }
    }
}

export const addLog = async(log) => {
    try {
        await Log.create(log);
        let transaction_history = await TransactionHistory.findOne({hash: log.transactionHash});
        //console.log( transaction_history?transaction_history.hash:transaction_history, log.transactionHash);
        if( transaction_history) {
            if( log.address != opensea_address && transaction_history.from_opensea)
                await fetch_transaction_by_hash(log.transactionHash, transaction_history);
        } else {
            if( log.address != opensea_address) {
                await fetch_transaction_by_hash(log.transactionHash, transaction_history);
            }
            else {
                addTransaction({
                    from_opensea: true,
                    block_height: log.blockNumber,
                    hash: log.transactionHash,
                    addresses: ["0x" + log.topics[2].substr(26),
                                "0x" + log.topics[1].substr(26)],
                    total: converter.hexToDec(log.data.substr(130)) * 1.0 / (10 ** 18),
                    fees: converter.hexToDec(log.gasPrice) / (10 ** 18) * converter.hexToDec(log.gasUsed),
                    gas_used: log.gasUsed,
                    gas_price: log.gasPrice,
                });
            }
        }
    } catch (error) {}
}

export const addTransaction = async(transaction) => {
    try {
        if( 1.0 * transaction.total >= 10000){
            transaction.alt_total = transaction.total;
            transaction.total = 0;
        }
        await TransactionHistory.create(transaction);
        let promise_array = [];
        if( transaction.from_opensea == true
            ||(transaction.internal_txids != undefined && !transaction.internal_txids.length)) {
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
    } catch (error) {console.log(error.message)};
}

export const getOnchainLatestBlocknumber = async() => {
    while(true) {
        console.log("latest BlockNumber:", converter.hexToDec(await fetch_latest_blocknumber()));
        await Timer(5000);
    }
}

export const fetch_latest_blocknumber = async() => {
    const API_URL = process.env.API_URL;
    const API_KEY = await wait_api_call_limit();
    const params = {
        module: "proxy",
        action: "eth_blockNumber",
        apikey: API_KEY
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
            console.log("Please check your network");
            console.log(err.message);
            await Timer(1000);
        }
    }
    let result = await OnChainInfo.findOne({});
    if( result == null) {
        result = new OnChainInfo({lastBlock: latest_onchain_blocknumber});
    }
    else
        result.lastBlock = latest_onchain_blocknumber;
    await result.save();
    return latest_onchain_blocknumber;
}
export const getOnchainLatestBlockNumber = async() => {
    const {lastBlock:latestBlock} = await OnChainInfo.findOne();
    return latestBlock;
}