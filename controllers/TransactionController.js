import axios from 'axios'
import converter from 'hex2dec'
import abiDecoder from '../utils/abi-decoder.js'
import util from 'util'
import { etherscan_apikeys, opensea_api } from '../consts.js'

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

async function wait_api_call_limit() {
    while(true){
        for(let i = 0; i < current_api_calls.length; i++) {
            if(current_api_calls[i] < max_api_calls){
                current_api_calls[i] ++;
                setTimeout(() => current_api_calls[i] --, 1200);
                return etherscan_apikeys[i];
            }
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

export const fetch_transactions = async(params, wallet) => {
    const API_URL = process.env.API_URL;
    
    const API_KEY = await wait_api_call_limit();
    Object.assign(params, {apikey: API_KEY});    
    const { data: {result: nft_tx_list, status: status }} = await axios.get(API_URL, {params});
    
    if( status != "1")
        return [];

    console.log("total nft tx count", nft_tx_list.length);
        
    var tx_results = [];
    await Promise.all(
        nft_tx_list.map( async (nft_tx, idx) => {
            await Timer(idx * 15);
            const API_KEY = await wait_api_call_limit();
            const { data: {result: nft_tx_details}} = await axios.get(API_URL, {params: {
                module: 'account',
                action: 'txlist',
                address: `0x${nft_tx.topics[2].substr(26)}`,
                startblock: nft_tx.blockNumber,
                endblock: nft_tx.blockNumber,
                apikey: API_KEY
            }})
            
            if( !nft_tx_details || !nft_tx_details.find ){
                console.log(nft_tx_details);
                return;
            }
            
            const nft_tx_detail = nft_tx_details.find(each => each.hash == nft_tx.transactionHash);
            if(!nft_tx_detail) return;
    
            const token = await get_token_info(nft_tx_detail.input);
            const tx_result = {
                blockNumber: nft_tx.blockNumber,
                transactionHash: nft_tx.transactionHash,
                from: "0x"+nft_tx.topics[2].substr(26),
                to: "0x"+nft_tx.topics[1].substr(26),
                token,
                value: converter.hexToDec(nft_tx.data.substr(130)) / (10 ** 18),
                timestamp: converter.hexToDec(nft_tx.timeStamp) * 1000
            }
            tx_result.type = wallet == tx_result.from ? 'sell' : 'buy',
            tx_results.push(tx_result);
    
            console.log(tx_result.transactionHash, tx_result.value);
        })        
    )
    return tx_results;
};