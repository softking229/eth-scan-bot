import axios from 'axios'
import converter from 'hex2dec'
import abiDecoder from '../utils/abi-decoder.js'
import util from 'util'

const Timer = util.promisify(setTimeout);

const max_api_calls = 5;
let current_api_calls = 0;

var get_token_number = (input) => {
    try{
        const buyCallData = abiDecoder.decodeMethod(input).params[3]['value'];
        const token_number = buyCallData.substr(buyCallData.length - 64);
        return token_number;
    } catch(err) {
        return 0;
    }
}

async function wait_api_call_limit() {
    console.log("current_api_calls", current_api_calls);
    while(current_api_calls >= max_api_calls) {
        await Timer(50);
    }
}

async function new_api_call() {
    current_api_calls ++;
    await Timer(1000);
    current_api_calls --;
}

axios.interceptors.request.use( request => {
    if(request.url == process.env.API_URL ){
        console.log(current_api_calls);
    }
    return request;
})

export const fetch_transactions = async(params) => {
    const API_URL = process.env.API_URL;
    const API_KEY = process.env.API_KEY;

    Object.assign(params, {apikey: API_KEY});    

    await wait_api_call_limit();
    new_api_call();
    const { data: {result: nft_tx_list, status: status }} = await axios.get(API_URL, {params});
    
    if( status != "1")
        return [];

    console.log("total nft tx count", nft_tx_list.length);
        
    var tx_results = [];
    await Promise.all(
        nft_tx_list.map( async (nft_tx, idx) => {
            await Timer(50 + idx * 100);
            await wait_api_call_limit();
            new_api_call();
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
    
            const tokenNumber = get_token_number(nft_tx_detail.input);
            const tx_result = {
                blockNumber: nft_tx.blockNumber,
                transactionHash: nft_tx.transactionHash,
                from: "0x"+nft_tx.topics[2].substr(26),
                to: "0x"+nft_tx.topics[1].substr(26),
                tokenNumber: converter.hexToDec(tokenNumber),
                value: converter.hexToDec(nft_tx.data.substr(130)),
                timeStamp: nft_tx.timeStamp
            }
            tx_results.push(tx_result);
    
            console.log(tx_result.transactionHash, tx_result.value / (10 ** 18));
        })        
    )
    return tx_results;
};